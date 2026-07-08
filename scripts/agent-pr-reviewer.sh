#!/usr/bin/env bash
# agent-pr-reviewer.sh — the unattended "pick a PR → review it → approve or request changes".
#
# Stage 3 of the build pipeline (docs/35). agent-scout files issues; agent-inbox builds an
# `agent` issue into a PR labelled `review-needed`; THIS agent reviews that PR with a strong
# model (R), grounded in the linked issue's ACCEPTANCE CRITERION + the diff, and posts a
# verdict:
#   - approve         → label `review-approved` (ready to land — NOT merged; merge stays human)
#   - request-changes → label `changes-requested` (+ a comment listing the file:line findings)
# agent-pr-fixer.sh (a DIFFERENT model F) then addresses the findings; the two loop until
# approved or PR_MAX_ROUNDS → `review-stuck` (human).
#
# Self-review note: GitHub forbids `gh pr review --approve/--request-changes` on your OWN PR,
# and the agent runs as the PR's author. So the verdict is delivered as a PR COMMENT + a
# LABEL (the label IS the state machine). Set PR_FORMAL_REVIEW=1 to additionally post a formal
# `gh pr review` (only works when GH_TOKEN is a different account than the PR author).
#
# Single-pass (the timer re-invokes it); one PR per run; a flock guarantees one instance.
# Every external command + path is overridable so the journey is testable hermetically
# (scripts/agent-pr-reviewer.test.sh) with NO real GitHub side-effects and NO LLM cost.
#
#   Labels: review-needed → review-wip → {review-approved | changes-requested | review-stuck}
#   Setup: scripts/agent-pr-loop-setup.sh  ·  Plan: docs/35-pr-review-fix-loop-iteration-plan.md
set -uo pipefail

# ── Injectable dependencies (defaults = production; tests override) ──────────────
ROOT="${PR_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
GH="${PR_GH:-gh}"
CLAUDE="${PR_CLAUDE:-claude}"
BASE="${PR_BASE:-main}"
HEAD_GLOB="${PR_HEAD_GLOB:-agent/}"               # only review agent-authored PRs (head prefix)
REVIEWER_MODEL="${PR_REVIEWER_MODEL:-opus}"       # model R
FIXER_MODEL="${PR_FIXER_MODEL:-sonnet}"           # model F — must DIFFER from R (FR-075)
MAX_ROUNDS="${PR_MAX_ROUNDS:-4}"
FORMAL_REVIEW="${PR_FORMAL_REVIEW:-0}"            # 1 = also post a formal gh pr review (needs a bot token)
# ── Per-repo namespace — so the PR loop in DIFFERENT repos never collides on a global /tmp
# lock (or clobbers a shared PR_LOGDIR). The git common dir is stable across a repo's own
# worktrees yet unique per repo; resolve to an ABSOLUTE path (`--git-common-dir` returns a bare
# ".git" at a repo root, so every repo would hash identically otherwise). The three PR-loop
# stages (reviewer/fixer/merger) derive the SAME key in the SAME repo → they still share
# PR_LOGDIR intra-repo while staying isolated across repos. All paths stay overridable.
pr_repo_ns() {
  local d
  d="$(git -C "$ROOT" rev-parse --git-common-dir 2>/dev/null)" || return 1
  [ -n "$d" ] || return 1
  d="$(cd "$ROOT" 2>/dev/null && cd "$d" 2>/dev/null && pwd)" || return 1
  printf '%s' "$d" | sha1sum | cut -c1-12
}
NS="$(pr_repo_ns || true)"; [ -n "$NS" ] || NS="nogit"
LOCK="${PR_REVIEWER_LOCK:-/tmp/agent-pr-reviewer-$NS.lock}"
LOGDIR="${PR_LOGDIR:-/tmp/agent-pr-review-$NS}"
REMOTE="${PR_REMOTE:-origin}"
WORKTREE_BASE="${PR_WORKTREE_BASE:-/tmp/agent-pr-review-$NS/worktrees}"  # isolated review checkouts

cd "$ROOT" || { echo "[pr-reviewer] cannot cd to $ROOT" >&2; exit 2; }
mkdir -p "$LOGDIR" "$WORKTREE_BASE"
log() { printf '[pr-reviewer] %s\n' "$*"; }

# ── Transient model-failure classification (issue #19) ───────────────────────────
# `claude -p --output-format json` can fail TRANSIENTLY — a session/usage limit, provider
# rate-limit, or overload — WITHOUT the model ever running. The CLI then emits an envelope like
#   {"is_error":true,"api_error_status":429,"result":"You've hit your session limit · resets …"}
# Such a failure is SELF-HEALING: the next timer tick retries once the limit resets, so it must
# NOT be escalated to a human (review-stuck) nor consume a review round. It is distinct from a
# GENUINE failure (the model ran but produced unparseable output / no verdict) — only that earns
# review-stuck. Prints: transient | hard | ok  (reads the CLI envelope captured from the run).
classify_model_result() { # <claude-cli-json-file>
  local f="$1" cls
  [ -s "$f" ] || { echo hard; return; }
  if jq -e 'type=="object"' "$f" >/dev/null 2>&1; then
    cls="$(jq -r '
      if (.is_error == true) then
        (((.api_error_status // .status // 0) | tostring) as $s
         | ((.result // .error // "") | tostring) as $m
         | if (["429","503","529"] | index($s)) != null then "transient"
           elif ($m | test("session limit|usage limit|rate.?limit|overloaded|quota|too many requests"; "i")) then "transient"
           else "hard" end)
      else "ok" end' "$f" 2>/dev/null)"
    echo "${cls:-hard}"; return
  fi
  # Non-JSON envelope (the CLI broke before emitting JSON): an unambiguous transient message is
  # transient; anything else is a hard failure.
  if grep -qiE 'session limit|usage limit|rate.?limit|overloaded|too many requests|quota' "$f"; then
    echo transient
  else
    echo hard
  fi
}

# Label ops via REST (gh pr edit --add-label hits the deprecated projectCards GraphQL field
# and flakily drops the label — the bug that left labels unset, docs/35). Non-fatal; add is
# LOGGED on failure, remove tolerates a 404 (label already absent). `{owner}/{repo}` auto-resolve.
add_label()    { "$GH" api -X POST   "repos/{owner}/{repo}/issues/$1/labels"     -f "labels[]=$2" >/dev/null 2>&1 || log "WARN: could not add label '$2' to #$1"; }
remove_label() { "$GH" api -X DELETE "repos/{owner}/{repo}/issues/$1/labels/$2"                   >/dev/null 2>&1 || true; }

# ── Serialize worktree add/remove under a per-REPO lock (parallel `git worktree add`s race on
# the shared `.git/worktrees` admin area and one fails). ─
WT_LOCK="$(git rev-parse --git-common-dir 2>/dev/null || echo .git)"
case "$WT_LOCK" in /*) ;; *) WT_LOCK="$ROOT/$WT_LOCK";; esac
WT_LOCK="${WT_LOCK%/}/.agent-worktree.lock"
git_worktree_locked() { local rc; exec 7>"$WT_LOCK"; flock 7; git worktree "$@"; rc=$?; exec 7>&-; return $rc; }

# ── Toolchain bootstrap (systemd/cron start bare — no shell init) ────────────────
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
[ -s "$HOME/miniconda3/etc/profile.d/conda.sh" ] && . "$HOME/miniconda3/etc/profile.d/conda.sh" >/dev/null 2>&1 || true

# ── FR-075: different-model enforcement (fail-fast — an independent review needs an
# independent model; never let one model both write and approve a change). ──────
if [ "$REVIEWER_MODEL" = "$FIXER_MODEL" ]; then
  log "REFUSING: PR_REVIEWER_MODEL ('$REVIEWER_MODEL') must DIFFER from PR_FIXER_MODEL — independent review needs a different model."
  exit 2
fi

# ── Preflight ───────────────────────────────────────────────────────────────────
for t in git jq "$GH" "$CLAUDE"; do
  command -v "$t" >/dev/null 2>&1 || { log "PREFLIGHT FAILED — not on PATH: $t"; exit 1; }
done

# ── Single-instance lock ─────────────────────────────────────────────────────────
exec 9>"$LOCK"
if ! flock -n 9; then log "another reviewer run in progress — exiting"; exit 0; fi

# ── Find one PR to review: open, labelled `review-needed`, head under $HEAD_GLOB,
# not already claimed/terminal. ──────────────────────────────────────────────────
# (no server-side --label here: gh implements it via the SEARCH API, whose index can
#  lag label churn by hours and hide the PR — the label is filtered client-side below
#  from live data instead)
prs_json="$("$GH" pr list --state open \
  --json number,headRefName,labels,title,url --limit 50 2>/dev/null || echo '[]')"
[ -z "$prs_json" ] && prs_json='[]'

eligible="$(jq -c --arg pfx "$HEAD_GLOB" 'map(select(
  (.headRefName | startswith($pfx)) and
  ([.labels[]?.name] | index("review-needed")) and
  ([.labels[]?.name] | index("review-wip")        | not) and
  ([.labels[]?.name] | index("fix-wip")            | not) and
  ([.labels[]?.name] | index("review-approved")    | not) and
  ([.labels[]?.name] | index("review-stuck")       | not)
)) | .[0] // empty' <<<"$prs_json")"

if [ -z "$eligible" ]; then log "no PRs awaiting review"; exit 0; fi

n="$(jq -r '.number' <<<"$eligible")"
head="$(jq -r '.headRefName' <<<"$eligible")"
title="$(jq -r '.title' <<<"$eligible")"
log "reviewing PR #${n} (${head}): ${title}"

add_label "$n" review-wip; remove_label "$n" review-needed

# ── Round accounting: a `<!-- pr-loop-round: N -->` marker is posted by the fixer each
# time it hands back. If we've already burned MAX_ROUNDS fix attempts, stop the loop. ──
round="$("$GH" pr view "$n" --json comments --jq '[.comments[].body | capture("pr-loop-round: (?<r>[0-9]+)").r | tonumber] | max // 0' 2>/dev/null || echo 0)"
[[ "$round" =~ ^[0-9]+$ ]] || round=0

# ── Gather review context: the diff + the linked issue's acceptance criterion. The head
# branch is `agent/issue-<N>`, so the linked issue is parseable from it. ──────────
issue_num="$(printf '%s' "$head" | sed -nE 's#.*issue[-/]([0-9]+).*#\1#p')"
issue_ctx="(no linked issue found from the head branch)"
if [ -n "$issue_num" ]; then
  issue_ctx="$("$GH" issue view "$issue_num" --json title,body --jq '"ISSUE #\(.title)\n\n\(.body)"' 2>/dev/null || echo "$issue_ctx")"
fi
diff="$("$GH" pr diff "$n" 2>/dev/null | head -c 60000)"   # bound the diff fed to the model

verdict_out="${LOGDIR}/verdict-${n}.json"; rm -f "$verdict_out"
prompt="$(cat <<EOF
You are agent-pr-reviewer, an INDEPENDENT, adversarial reviewer of a pull request. You did
NOT write this code. Review it strictly but fairly. Judge SUBSTANCE, not style:
  - Does it actually satisfy the linked issue's ACCEPTANCE CRITERION?
  - Real bugs, edge cases, security/tenant-isolation regressions, broken error handling?
  - Is it scoped (no unrelated drive-by changes)? Do the tests actually exercise the change
    (not deleted/weakened to pass a gate)?
Do NOT raise style/formatting nits. Every requested change MUST cite a file:line and the
concrete defect or the acceptance clause it fails — actionable and falsifiable.

This is review round ${round} (cap ${MAX_ROUNDS}).

=== LINKED ISSUE (acceptance criterion to verify against) ===
${issue_ctx}

=== PULL REQUEST #${n} DIFF ===
${diff}

Write ONLY a JSON object (no prose, no fence) to the file:
  ${verdict_out}
Schema:
{
  "verdict": "approve" | "request-changes",
  "summary": "2-4 sentences: the overall judgement + whether the acceptance criterion is met",
  "findings": [   // [] when approve
    { "file": "path", "line": "NN or range", "severity": "blocker|major|minor", "issue": "the concrete defect + what to change" }
  ]
}
Approve ONLY if the acceptance criterion is met and there are no blocker/major defects.
EOF
)"
log "running reviewer model ${REVIEWER_MODEL}…"
review_log="${LOGDIR}/agent-review-${n}.json"

# ── Isolated worktree at the PR head — the reviewer model must ONLY ever touch its own clean
# temp worktree, NEVER the primary repo branch. It runs with bypassPermissions and otherwise
# `git checkout`s the PR branch in the SHARED working tree to inspect the code, switching the
# primary repo's HEAD off `main` (even if it switches back, that is not the intended design). A
# DETACHED worktree lets the model fetch/checkout/read freely against an isolated tree; the diff
# is still in the prompt as a fallback if the worktree can't be created. Cleaned up on EXIT. ─
git fetch -q "$REMOTE" "$head" >/dev/null 2>&1 || true
review_wt="${WORKTREE_BASE}/pr-${n}"
git_worktree_locked remove --force "$review_wt" >/dev/null 2>&1 || true; rm -rf "$review_wt" >/dev/null 2>&1 || true
if git_worktree_locked add -f --detach "$review_wt" "${REMOTE}/${head}" >/dev/null 2>&1; then
  trap 'cd "$ROOT" 2>/dev/null || true; git_worktree_locked remove --force "$review_wt" >/dev/null 2>&1 || true' EXIT
else
  log "could not create review worktree on ${head} — reviewing from the diff only"
  review_wt=""
fi

( [ -n "$review_wt" ] && cd "$review_wt" 2>/dev/null || cd "$ROOT"
  PR_VERDICT_OUT="$verdict_out" "$CLAUDE" -p "$prompt" \
    --permission-mode bypassPermissions --model "$REVIEWER_MODEL" --output-format json \
    >"$review_log" 2>&1 ) || log "reviewer model exited non-zero — continuing"

# ── Transient failure (rate/usage limit, overload) → the model never ran. Leave the PR exactly
# as we found it (back to review-needed) and retry on the next tick — do NOT escalate or burn a
# round. MUST come BEFORE the "no parseable verdict" branch (a transient run writes no verdict). ─
if [ "$(classify_model_result "$review_log")" = "transient" ]; then
  log "reviewer model hit a transient limit (rate-limit/usage-limit/overload) — leaving PR #${n} as review-needed; retry next tick (no round consumed)"
  add_label "$n" review-needed; remove_label "$n" review-wip
  exit 0
fi

# ── Parse the verdict (robust) ───────────────────────────────────────────────────
verdict=""
if [ -s "$verdict_out" ] && jq -e . "$verdict_out" >/dev/null 2>&1; then
  verdict="$(jq -r '.verdict // empty' "$verdict_out" 2>/dev/null)"
fi
if [ -z "$verdict" ]; then
  log "no parseable verdict — routing to review-stuck"
  "$GH" pr comment "$n" -b "⚠️ agent-pr-reviewer: could not produce a verdict — needs a human." >/dev/null 2>&1 || true
  add_label "$n" review-stuck; remove_label "$n" review-wip
  exit 0
fi

summary="$(jq -r '.summary // ""' "$verdict_out")"

# ── Verdict↔findings reconciliation (deterministic, not model-trusted) ────────────
# The prompt says "approve ONLY if … no blocker/major defects", but a less-capable reviewer model
# routinely self-contradicts: it emits verdict="approve" while ALSO listing blocker/major findings.
# Trusting the verdict string verbatim is the single highest-impact false-approve, because the
# merger ships on the `review-approved` label alone. Enforce the rule in code: an "approve" that
# carries any blocker/major finding is downgraded to request-changes. (minor findings don't block.)
if [ "$verdict" = "approve" ]; then
  blocking="$(jq -r '[(.findings // [])[] | select((.severity // "") | ascii_downcase | (. == "blocker" or . == "major"))] | length' "$verdict_out" 2>/dev/null)"
  [[ "$blocking" =~ ^[0-9]+$ ]] || blocking=0
  if [ "$blocking" -gt 0 ]; then
    log "reviewer self-contradicted: verdict=approve with ${blocking} blocker/major finding(s) — downgrading to request-changes"
    summary="⚠️ Auto-downgraded from APPROVE: the review listed ${blocking} blocker/major finding(s), which contradict an approval. ${summary}"
    verdict="request-changes"
  fi
fi

if [ "$verdict" = "approve" ]; then
  body="$(printf '✅ **agent-pr-reviewer: APPROVED** (model %s, round %s)\n\n%s\n\n— gates green + acceptance criterion met. Ready to land (a human merges).\n<!-- pr-review: approved round %s -->' \
    "$REVIEWER_MODEL" "$round" "$summary" "$round")"
  "$GH" pr comment "$n" -b "$body" >/dev/null 2>&1 || true
  [ "$FORMAL_REVIEW" = "1" ] && "$GH" pr review "$n" --approve --body "$summary" >/dev/null 2>&1 || true
  add_label "$n" review-approved; remove_label "$n" review-wip; remove_label "$n" changes-requested
  log "PR #${n} APPROVED → review-approved"
  exit 0
fi

# request-changes — but if we've exhausted the rounds, stop the loop instead of looping again.
findings_md="$(jq -r '(.findings // []) | map("- `\(.file):\(.line)` **[\(.severity)]** \(.issue)") | join("\n")' "$verdict_out" 2>/dev/null)"
[ -z "$findings_md" ] && findings_md="_(no structured findings — see summary)_"

if [ "$round" -ge "$MAX_ROUNDS" ]; then
  body="$(printf '🛑 **agent-pr-reviewer: STILL requesting changes after %s round(s)** — handing to a human.\n\n%s\n\n### Outstanding\n%s' \
    "$round" "$summary" "$findings_md")"
  "$GH" pr comment "$n" -b "$body" >/dev/null 2>&1 || true
  add_label "$n" review-stuck; remove_label "$n" review-wip
  log "PR #${n} hit round cap (${round}/${MAX_ROUNDS}) → review-stuck"
  exit 0
fi

body="$(printf '🔧 **agent-pr-reviewer: CHANGES REQUESTED** (model %s, round %s)\n\n%s\n\n### Findings (address each, then the fixer hands back for re-review)\n%s\n<!-- pr-review: changes-requested round %s -->' \
  "$REVIEWER_MODEL" "$round" "$summary" "$findings_md" "$round")"
"$GH" pr comment "$n" -b "$body" >/dev/null 2>&1 || true
[ "$FORMAL_REVIEW" = "1" ] && "$GH" pr review "$n" --request-changes --body "$summary" >/dev/null 2>&1 || true
add_label "$n" changes-requested; remove_label "$n" review-wip
log "PR #${n} CHANGES REQUESTED → changes-requested"
exit 0
