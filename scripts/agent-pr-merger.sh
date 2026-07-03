#!/usr/bin/env bash
# agent-pr-merger.sh — the unattended "select every reviewed PR → integrate them all →
# resolve conflicts by including ALL the work → re-gate → AUTO-MERGE to main".
#
# The close of the PR loop (docs/AGENT-HARNESS.md). agent-pr-reviewer approves a PR (label
# `review-approved`) and historically stopped there — "merging stays human". THIS agent closes
# the last manual step: it collects ALL `review-approved` PRs, merges them together
# onto an integration branch off the latest main, resolves any conflicts BETWEEN the PRs by
# including every PR's work (via a `claude -p` turn, model M), re-runs the FULL project gates on
# the combined result, and — only if green — fast-forwards `main` to the integration. After this,
# the ONLY human input in the whole pipeline is filing + labelling the issue.
#
# This is also ProjectIntelligence's local CI/CD gate: the green checkmark that gates the merge
# is these gates running on YOUR machine at merge time. Nothing reaches the base branch unless
# `scripts/quality-gates.sh` passes here.
#
# WHY ONE INTEGRATION (not N independent merges): two approved PRs can be individually green but
# conflict with each other, or pass alone yet break combined. Integrating them together and
# gating the union is the only way to ship them all without a human untangling conflicts. So
# unlike the reviewer/fixer (which fan out per-PR), the merger is intentionally SERIAL — one
# integration per run, guarded by a single global flock.
#
# WHY PRE-MERGE REBASE (issue #822): a branch many commits behind main (PR #821 was 115 behind)
# produces conflicts at `git merge --no-ff` time even when `gh pr view` reports MERGEABLE —
# GitHub computes mergeability against a different base. The reactive merge-time resolver then
# fires on a phantom conflict and (observed across several PRs) can hang for minutes holding the
# lock. So each PR is first REBASED onto the integration base (resolving any conflicts THERE,
# before the merge commit); the subsequent `--no-ff` merge of the rebased branch is clean by
# construction. Only a genuine PR-vs-PR conflict (two approved PRs touching the same lines) can
# still reach the merge-time resolver.
#
# SAFETY (non-negotiable, even though merging is now automatic):
#   1. Isolation  — all work in a dedicated worktree; the integration is pushed to `main` ONLY
#                   after the gates pass. Never your primary working copy.
#   2. Gates gate the merge — a red integration is NEVER pushed → the PRs go to `merge-stuck`.
#   3. Conflicts that the resolver can't clear (markers remain) → `merge-stuck`, never a forced
#      or marker-polluted commit.
#   4. Fast-forward only — if `main` moved under us the push is refused (no force) → `merge-stuck`.
#
# Hermetically testable (scripts/agent-pr-merger.test.sh) — gh/claude injectable + stubbed.
#
#   Labels: review-approved → merge-wip → {merged | merge-stuck}
#   Setup: scripts/agent-pr-loop-setup.sh  ·  Docs: docs/AGENT-HARNESS.md
set -uo pipefail

# ── Injectable dependencies (defaults = production; tests override) ──────────────
ROOT="${PR_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
GH="${PR_GH:-gh}"
CLAUDE="${PR_CLAUDE:-claude}"
BASE="${PR_BASE:-main}"
REMOTE="${PR_REMOTE:-origin}"
HEAD_GLOB="${PR_HEAD_GLOB:-agent/}"               # only merge agent-authored PRs
MERGER_MODEL="${PR_MERGER_MODEL:-opus}"           # model M (resolves conflicts)
MAX_PRS="${PR_MERGER_MAX_PRS:-20}"                # cap PRs integrated per run
GATES_CMD="${PR_GATES_CMD:-scripts/quality-gates.sh --only typecheck,lint,unit}"   # the gates on the union
DEPS_MODE="${PR_DEPS:-install}"
INTEGRATION_BRANCH="${PR_INTEGRATION_BRANCH:-agent/integration}"
# ── Per-repo namespace — so the PR loop in DIFFERENT repos never collides on a global /tmp
# lock (or clobbers a shared PR_LOGDIR). The git common dir is stable across a repo's own
# worktrees yet unique per repo; resolve to an ABSOLUTE path (`--git-common-dir` returns a bare
# ".git" at a repo root, so every repo would hash identically otherwise). The three PR-loop
# stages (reviewer/fixer/merger) derive the SAME key in the SAME repo → they still share
# PR_LOGDIR intra-repo while staying isolated across repos (one source of truth, not a
# per-repo string baked into the script).
pr_repo_ns() {
  local d
  d="$(git -C "$ROOT" rev-parse --git-common-dir 2>/dev/null)" || return 1
  [ -n "$d" ] || return 1
  d="$(cd "$ROOT" 2>/dev/null && cd "$d" 2>/dev/null && pwd)" || return 1
  printf '%s' "$d" | sha1sum | cut -c1-12
}
NS="$(pr_repo_ns || true)"; [ -n "$NS" ] || NS="nogit"
LOCK="${PR_MERGER_LOCK:-/tmp/agent-pr-merger-$NS.lock}"
LOGDIR="${PR_LOGDIR:-/tmp/agent-pr-review-$NS}"
WORKTREE_BASE="${PR_WORKTREE_BASE:-/tmp/agent-pr-review-$NS/worktrees}"
# Commit identity for the integration merge commits (works even on a bare systemd env).
# The author email MUST resolve to a GitHub account with access to the Vercel project —
# Vercel blocks auto-deploys for pushes whose head commit author it cannot map to a
# collaborator ("Deployment Blocked: commit author email is not valid"). Default to the
# repo owner's configured git email; keep the agent name for provenance in the log.
MERGER_DEFAULT_EMAIL="$(git -C "$ROOT" config user.email 2>/dev/null || true)"
[ -n "$MERGER_DEFAULT_EMAIL" ] || MERGER_DEFAULT_EMAIL="haroldmei.cn@gmail.com"
GIT_ID=( -c "user.name=${MERGER_GIT_NAME:-agent-pr-merger}" -c "user.email=${MERGER_GIT_EMAIL:-$MERGER_DEFAULT_EMAIL}" )

cd "$ROOT" || { echo "[pr-merger] cannot cd to $ROOT" >&2; exit 2; }
mkdir -p "$LOGDIR" "$WORKTREE_BASE"
log() { printf '[pr-merger] %s\n' "$*"; }

# ── Transient model-failure classification (issue #19) ───────────────────────────
# `claude -p --output-format json` can fail TRANSIENTLY — a session/usage limit, provider
# rate-limit, or overload — WITHOUT the model ever running. The CLI then emits an envelope like
#   {"is_error":true,"api_error_status":429,"result":"You've hit your session limit · resets …"}
# When the conflict resolver hits this it leaves the markers in place, which would otherwise be
# misread as "unresolvable conflict" and routed to merge-stuck (a wasted human escalation on a
# self-healing limit). Such a failure must instead defer the integration and retry next tick.
# Prints: transient | hard | ok.
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
  if grep -qiE 'session limit|usage limit|rate.?limit|overloaded|too many requests|quota' "$f"; then
    echo transient
  else
    echo hard
  fi
}

# ── Conflict-marker detector ──────────────────────────────────────────────────────
# Refuse to ship any tree that still contains a git conflict marker. The old check was
# `git grep -lE '^(<<<<<<<|>>>>>>>) '` — it REQUIRED a trailing space, so a resolver (especially a
# weaker model) that left a bare `<<<<<<<` / `>>>>>>>` at end-of-line slipped through and a
# marker-polluted, broken merge could reach `main`. Match a 7-char start/end marker followed by a
# space, tab, OR end-of-line; the alternation is exactly 7 chars, so an 8+-char run (not a real
# git marker) still won't match. Start/end markers only (never bare `=======`, which legitimately
# appears as a Markdown/RST heading underline). Returns 0 if a marker is present.
has_conflict_markers() { git grep -lE '^(<<<<<<<|>>>>>>>)([ '$'\t'']|$)' >/dev/null 2>&1; }

# ── Serialize worktree add/remove under a per-REPO lock (shared with the other agent-* scripts
# via the git common dir) — parallel `git worktree add`s race on `.git/worktrees`. ──
WT_LOCK="$(git rev-parse --git-common-dir 2>/dev/null || echo .git)"
case "$WT_LOCK" in /*) ;; *) WT_LOCK="$ROOT/$WT_LOCK";; esac
WT_LOCK="${WT_LOCK%/}/.agent-worktree.lock"
git_worktree_locked() { local rc; exec 7>"$WT_LOCK"; flock 7; git worktree "$@"; rc=$?; exec 7>&-; return $rc; }

# Label ops via REST (gh pr edit --add-label hits the deprecated projectCards GraphQL field
# and flakily drops the label, docs/35). Non-fatal; add LOGGED on failure, remove tolerates 404.
add_label()    { "$GH" api -X POST   "repos/{owner}/{repo}/issues/$1/labels"     -f "labels[]=$2" >/dev/null 2>&1 || log "WARN: could not add label '$2' to #$1"; }
remove_label() { "$GH" api -X DELETE "repos/{owner}/{repo}/issues/$1/labels/$2"                   >/dev/null 2>&1 || true; }
# Mark every PR in this integration with a terminal label + comment, then exit.
finish_all() { # <label> <comment>
  local lbl="$1" msg="$2" p
  for p in "${PR_NUMS[@]:-}"; do
    [ -n "$p" ] || continue
    "$GH" pr comment "$p" -b "$msg" >/dev/null 2>&1 || true
    add_label "$p" "$lbl"; remove_label "$p" merge-wip
  done
}

# ── Toolchain bootstrap ──────────────────────────────────────────────────────────
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
[ -s "$HOME/miniconda3/etc/profile.d/conda.sh" ] && . "$HOME/miniconda3/etc/profile.d/conda.sh" >/dev/null 2>&1 || true

# ── Preflight ───────────────────────────────────────────────────────────────────
for t in git jq "$GH" "$CLAUDE"; do
  command -v "$t" >/dev/null 2>&1 || { log "PREFLIGHT FAILED — not on PATH: $t"; exit 1; }
done

# ── Single-instance lock — one integration at a time (the merger is intentionally serial) ──
exec 9>"$LOCK"
if ! flock -n 9; then log "another merger run in progress — exiting"; exit 0; fi

# ── Select EVERY approved PR (head agent/*, not already merging/terminal) ─────────
# (no server-side --label here: gh implements it via the SEARCH API, whose index can
#  lag label churn by hours and hide the PR — the label is filtered client-side below
#  from live data instead)
prs_json="$("$GH" pr list --state open \
  --json number,headRefName,labels,title --limit 50 2>/dev/null || echo '[]')"
[ -z "$prs_json" ] && prs_json='[]'
selected="$(jq -c --arg pfx "$HEAD_GLOB" --argjson max "$MAX_PRS" 'map(select(
  (.headRefName | startswith($pfx)) and
  ([.labels[]?.name] | index("review-approved")) and
  ([.labels[]?.name] | index("merge-wip")   | not) and
  ([.labels[]?.name] | index("merged")       | not) and
  ([.labels[]?.name] | index("merge-stuck")  | not)
)) | sort_by(.number) | .[0:$max]' <<<"$prs_json")"

count="$(jq 'length' <<<"$selected")"
if [ "${count:-0}" -eq 0 ]; then log "no approved PRs to merge"; exit 0; fi

# Parallel arrays of the selected PR numbers + head branches.
mapfile -t PR_NUMS  < <(jq -r '.[].number'      <<<"$selected")
mapfile -t PR_HEADS < <(jq -r '.[].headRefName' <<<"$selected")
log "integrating ${count} approved PR(s): ${PR_NUMS[*]}"

# Claim them all so a concurrent run (or the reviewer/fixer) won't touch them mid-merge.
for i in "${!PR_NUMS[@]}"; do add_label "${PR_NUMS[$i]}" merge-wip; remove_label "${PR_NUMS[$i]}" review-approved; done

# ── Integration worktree on a branch off the LATEST main ─────────────────────────
git fetch -q "$REMOTE" "$BASE" >/dev/null 2>&1 || true
base_ref="${REMOTE}/${BASE}"; git rev-parse --verify -q "$base_ref" >/dev/null || base_ref="$BASE"
base_sha="$(git rev-parse "$base_ref" 2>/dev/null || echo "")"
wt="${WORKTREE_BASE}/integration"
git_worktree_locked remove --force "$wt" >/dev/null 2>&1 || true; rm -rf "$wt" >/dev/null 2>&1 || true
if ! git_worktree_locked add -f -B "$INTEGRATION_BRANCH" "$wt" "$base_ref" >/dev/null 2>&1; then
  log "could not create the integration worktree"
  finish_all merge-stuck "⚠️ agent-pr-merger: could not create an integration worktree — needs a human."
  exit 0
fi
cleanup() { cd "$ROOT" 2>/dev/null || true; git_worktree_locked remove --force "$wt" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cd "$wt"

# ── Conflict resolver (model M): reconcile to INCLUDE every PR's work ─────────────
# Invoked at REBASE time (preferred — a stale branch's conflicts with main are cleared BEFORE
# the merge commit, issue #822) and, for genuine PR-vs-PR conflicts, at MERGE time. Writes the
# CLI envelope to <out-json> and prints the transient|hard|ok classification so the caller can
# defer the whole integration on a self-healing limit.
invoke_resolver() { # <pr-num> <head> <stage:rebase|merge> <conflicted-files> <out-json>
  local n="$1" head="$2" stage="$3" conflicted="$4" out="$5" prompt
  prompt="$(cat <<EOF
You are agent-pr-merger's conflict resolver, working in an isolated git worktree mid-${stage}.
We are integrating multiple INDEPENDENTLY-APPROVED pull requests onto '${BASE}'. The ${stage} of
PR #${n} (branch '${head}') hit conflicts in: ${conflicted}

Resolve EVERY conflict so the result INCLUDES ALL PRs' work — never drop one side to favour the
other; combine them so both intents survive (union of behaviour, both functions/imports/cases,
merged config). Remove every conflict marker (<<<<<<<, =======, >>>>>>>). If two changes are
genuinely mutually exclusive, prefer the union that keeps both code paths compiling. Edit the
files in place. Do NOT run git, do NOT commit, do NOT push — just leave the files resolved.
EOF
)"
  "$CLAUDE" -p "$prompt" --permission-mode bypassPermissions --model "$MERGER_MODEL" --output-format json \
    >"$out" 2>&1 || log "PR #${n}: resolver exited non-zero — verifying anyway" 1>&2
  classify_model_result "$out"
}

# Is a rebase currently in progress (stopped on a conflict)?
rebase_in_progress() {
  [ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ] && return 0
  [ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ] && return 0
  return 1
}

# Rebase the CURRENT branch onto $base_ref, resolving each conflict stop with the model so the
# stale branch lands on the same base as the integration (issue #822). A 100+-commit-behind
# branch can stop many times; we resolve, re-check for markers, and `--continue` until done.
# Prints exactly one of:  ok | stuck | transient.
rebase_onto_base() { # <pr-num> <head>
  local n="$1" head="$2" rc cls conflicted guard=0
  git "${GIT_ID[@]}" rebase --empty=drop "$base_ref" >>"${LOGDIR}/rebase-${n}.log" 2>&1; rc=$?
  while [ $rc -ne 0 ]; do
    # A non-conflict failure (or a rebase that's no longer in progress) is unrecoverable here.
    if ! rebase_in_progress; then echo stuck; return; fi
    # Runaway backstop — far above any real 100+-commit rebase; never spin forever.
    guard=$((guard+1)); if [ "$guard" -gt 1000 ]; then git rebase --abort >/dev/null 2>&1 || true; echo stuck; return; fi
    conflicted="$(git diff --name-only --diff-filter=U 2>/dev/null | tr '\n' ' ')"
    if [ -n "${conflicted// /}" ]; then
      cls="$(invoke_resolver "$n" "$head" rebase "$conflicted" "${LOGDIR}/agent-rebase-${n}.json")"
      # Transient (rate/usage limit, overload) → the resolver never ran, markers remain. Defer.
      if [ "$cls" = "transient" ]; then git rebase --abort >/dev/null 2>&1 || true; echo transient; return; fi
      git add -A >/dev/null 2>&1 || true
      # Markers survived → genuinely unresolvable; bail to a human (same as today).
      if has_conflict_markers; then
        git rebase --abort >/dev/null 2>&1 || true; echo stuck; return
      fi
    fi
    GIT_EDITOR=true git "${GIT_ID[@]}" rebase --continue >>"${LOGDIR}/rebase-${n}.log" 2>&1; rc=$?
  done
  echo ok
}

# ── For each approved PR (low→high PR number): pre-merge rebase onto the integration base so
# branch-vs-main staleness is reconciled HERE (issue #822), THEN a clean --no-ff merge of the
# rebased branch into the integration. Only a genuine PR-vs-PR conflict can still reach the
# merge-time resolver; a branch merely behind main never does. ──
merged_nums=()
PR_REBASED_SHAS=()   # parallel to PR_NUMS: rebased tip SHA for each PR (used post-push)
for i in "${!PR_NUMS[@]}"; do
  n="${PR_NUMS[$i]}"; head="${PR_HEADS[$i]}"
  git fetch -q "$REMOTE" "$head" >/dev/null 2>&1 || true
  rb="rebased-${head//\//-}"   # slashes → dashes so the ref is a single segment

  # ── (a) Pre-merge rebase: replay the PR onto $base_ref, resolving conflicts before the merge.
  log "rebasing PR #${n} (${head}) onto ${base_ref} before merge…"
  if ! git checkout -q -B "$rb" "${REMOTE}/${head}" >>"${LOGDIR}/rebase-${n}.log" 2>&1; then
    log "PR #${n}: could not check out the PR head for rebase — aborting integration"
    git checkout -q "$INTEGRATION_BRANCH" >/dev/null 2>&1 || true
    finish_all merge-stuck "$(printf '🛑 agent-pr-merger: could not check out PR #%s (%s) to rebase — needs a human.' "$n" "$head")"
    exit 0
  fi
  cls="$(rebase_onto_base "$n" "$head")"
  git checkout -q "$INTEGRATION_BRANCH" >>"${LOGDIR}/merge-${n}.log" 2>&1
  if [ "$cls" = "transient" ]; then
    log "resolver hit a transient limit (rate-limit/usage-limit/overload) while rebasing PR #${n} — deferring; PRs return to review-approved, retry next tick"
    git branch -D "$rb" >/dev/null 2>&1 || true
    for p in "${PR_NUMS[@]:-}"; do [ -n "$p" ] || continue; add_label "$p" review-approved; remove_label "$p" merge-wip; done
    exit 0
  fi
  if [ "$cls" = "stuck" ]; then
    log "PR #${n}: rebase conflicts could not be auto-resolved — aborting integration"
    git branch -D "$rb" >/dev/null 2>&1 || true
    finish_all merge-stuck "$(printf '🛑 agent-pr-merger: could not auto-resolve rebase conflicts while integrating PR #%s (%s) — needs a human.' "$n" "$head")"
    exit 0
  fi
  # Capture the rebased tip so we can force-push the PR head branch to it after the push to
  # main — rebasing rewrites SHAs, and GitHub only auto-closes a PR when its head commit is
  # reachable from the base branch.
  PR_REBASED_SHAS[$i]="$(git rev-parse "$rb" 2>/dev/null || echo "")"

  # ── (b) Merge the rebased branch into the integration. Clean by construction for a branch
  #        that was merely behind main; only a real PR-vs-PR conflict can still occur.
  log "merging PR #${n} (${head})…"
  if git "${GIT_ID[@]}" merge --no-ff --no-edit -m "merge: PR #${n} (${head})" "$rb" >/dev/null 2>>"${LOGDIR}/merge-${n}.log"; then
    git branch -D "$rb" >/dev/null 2>&1 || true
    merged_nums+=("$n"); continue
  fi

  # PR-vs-PR conflict — ask the resolver (model M) to reconcile INCLUDING every PR's work.
  log "PR #${n}: conflict — invoking resolver model ${MERGER_MODEL} to include all work…"
  conflicted="$(git diff --name-only --diff-filter=U 2>/dev/null | tr '\n' ' ')"
  cls="$(invoke_resolver "$n" "$head" merge "$conflicted" "${LOGDIR}/agent-merge-${n}.json")"

  # Transient failure (rate/usage limit, overload) → the resolver never ran, so the markers are
  # still there. Defer the WHOLE integration: abort the merge, hand every claimed PR back to
  # review-approved (label-only, no comment — repeated transient ticks must not spam the threads),
  # and retry on the next tick. Do NOT route to merge-stuck. MUST precede the marker check below.
  if [ "$cls" = "transient" ]; then
    log "resolver hit a transient limit (rate-limit/usage-limit/overload) while integrating PR #${n} — deferring; PRs return to review-approved, retry next tick"
    git merge --abort >/dev/null 2>&1 || true
    git branch -D "$rb" >/dev/null 2>&1 || true
    for p in "${PR_NUMS[@]:-}"; do [ -n "$p" ] || continue; add_label "$p" review-approved; remove_label "$p" merge-wip; done
    exit 0
  fi

  git add -A >/dev/null 2>&1 || true
  # Refuse to commit if any conflict marker survived (never ship a marker-polluted merge).
  if has_conflict_markers; then
    log "PR #${n}: conflict markers remain after resolution — aborting integration"
    git merge --abort >/dev/null 2>&1 || true
    git branch -D "$rb" >/dev/null 2>&1 || true
    finish_all merge-stuck "$(printf '🛑 agent-pr-merger: could not auto-resolve conflicts while integrating PR #%s (%s) — needs a human.' "$n" "$head")"
    exit 0
  fi
  git "${GIT_ID[@]}" commit --no-edit -m "merge: PR #${n} (${head}) — conflicts resolved to include all work" >/dev/null 2>&1 || true
  git branch -D "$rb" >/dev/null 2>&1 || true
  merged_nums+=("$n")
done

# ── No-op guard: nothing actually integrated beyond base ──────────────────────────
if [ "$(git rev-parse HEAD)" = "$base_sha" ]; then
  log "integration produced no new commits over ${BASE} — nothing to merge"
  finish_all merge-stuck "⚠️ agent-pr-merger: integrating the approved PR(s) produced no change over ${BASE} — needs a human."
  exit 0
fi

# ── Provision deps the gates need (fresh worktree has no node_modules) ────────────
# Root-level pnpm install + explicit prisma generate (pnpm 10 blocks dependency build
# scripts, and the vitest suites import the generated Prisma client).
if [ -f "$ROOT/package.json" ] && [ -f "$wt/package.json" ]; then
  if [ "$DEPS_MODE" = "symlink" ]; then
    [ -d "$ROOT/node_modules" ] && [ ! -e "$wt/node_modules" ] && ln -s "$ROOT/node_modules" "$wt/node_modules" 2>/dev/null || true
  elif [ -f "$wt/pnpm-lock.yaml" ]; then
    ( cd "$wt" && pnpm install --frozen-lockfile --prefer-offline --silent ) >>"${LOGDIR}/deps-integration.log" 2>&1 || true
  else
    ( cd "$wt" && pnpm install --prefer-offline --silent ) >>"${LOGDIR}/deps-integration.log" 2>&1 || true
  fi
  [ "$DEPS_MODE" = "symlink" ] || ( cd "$wt" && pnpm exec prisma generate ) >>"${LOGDIR}/deps-integration.log" 2>&1 || true
fi
[ -f pnpm-lock.yaml ] && git checkout -q -- pnpm-lock.yaml 2>/dev/null || true

# ── Provision local env-files the gates need (symlinked, never committed) ─────────
shopt -s nullglob
for src in "$ROOT"/.env "$ROOT"/.env.local "$ROOT"/.env.staging.local "$ROOT"/.env.production.local; do
  [ -e "$src" ] || continue
  rel="${src#"$ROOT"/}"; dst="$wt/$rel"
  [ -e "$dst" ] || { mkdir -p "$(dirname "$dst")" && ln -s "$src" "$dst" 2>/dev/null; } || true
done
shopt -u nullglob

# ── Gate the COMBINED result. A red integration is never merged. ──────────────────
log "running full gates on the integration: ${GATES_CMD}"
if ! bash -c "$GATES_CMD" >"${LOGDIR}/gates-integration.log" 2>&1; then
  log "integration gates FAILED — not merging"
  finish_all merge-stuck "$(printf '🛑 agent-pr-merger: the combined integration of PR(s) %s failed the gates (not merged) — needs a human.\n\n```\n%s\n```' "${merged_nums[*]}" "$(tail -25 "${LOGDIR}/gates-integration.log")")"
  exit 0
fi

# ── Fast-forward main to the integration. No force — if main moved, bail to a human. ──
log "gates green — fast-forwarding ${BASE} to the integration"
if ! git push "$REMOTE" "HEAD:${BASE}" >/dev/null 2>>"${LOGDIR}/push-integration.log"; then
  log "push to ${BASE} was refused (main moved or remote rejected) — not merged"
  finish_all merge-stuck "🛑 agent-pr-merger: could not fast-forward ${BASE} (it moved under the integration) — re-review needed by a human."
  exit 0
fi

# ── Force-update each PR's head branch to its rebased tip so the commit is reachable
# from main → GitHub auto-marks the PR as merged (not just labelled). Without this,
# rebased PRs stay OPEN because the original head SHA was never pushed to main. ──
for i in "${!PR_NUMS[@]}"; do
  sha="${PR_REBASED_SHAS[$i]:-}"
  head="${PR_HEADS[$i]}"
  [ -n "$sha" ] || continue
  git push --force "$REMOTE" "${sha}:refs/heads/${head}" >/dev/null 2>>"${LOGDIR}/push-integration.log" \
    || log "WARN: PR #${PR_NUMS[$i]}: could not update head branch '${head}' to rebased tip — PR may not auto-close on GitHub"
done

# ── Success: each PR's rebased head is now on main → GitHub auto-closes them as merged.
# Label + comment explicitly so the state machine + the issue thread reflect it. ──
for i in "${!PR_NUMS[@]}"; do
  n="${PR_NUMS[$i]}"
  "$GH" pr comment "$n" -b "$(printf '🚀 agent-pr-merger: integrated with %s and auto-merged into %s (gates green). Shipped.' "${#PR_NUMS[@]} PR(s)" "$BASE")" >/dev/null 2>&1 || true
  add_label "$n" merged; remove_label "$n" merge-wip
done
log "MERGED ${#PR_NUMS[@]} PR(s) into ${BASE}: ${PR_NUMS[*]}"
exit 0
