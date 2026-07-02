#!/usr/bin/env bash
# agent-pr-fixer.sh — the unattended "pick a PR with requested changes → fix them → hand back".
#
# Stage 4 of the build pipeline (docs/35). agent-pr-reviewer (model R) requested changes on a
# PR (label `changes-requested`); THIS agent — a DIFFERENT model F — addresses each finding in
# an ISOLATED worktree on the PR's head branch, RE-RUNS the project gates, and:
#   - gates green → pushes the branch + comments what changed + relabels `review-needed`
#                   (round++) so the reviewer re-reviews.
#   - gates red   → does NOT push; routes to `review-stuck` with the gate log (never push red).
# The reviewer⇄fixer loop runs until APPROVED or PR_MAX_ROUNDS → `review-stuck` (human).
#
# ISOLATION: the fix happens in a DEDICATED git worktree checked out on the PR head branch —
# never your primary working copy, never `main`. Only the PR branch is pushed.
#
# Single-pass (the timer re-invokes it); one PR per run; a flock guarantees one instance.
# Hermetically testable (scripts/agent-pr-fixer.test.sh) — gh/claude injectable + stubbed.
#
#   Labels: changes-requested → fix-wip → {review-needed (round++) | review-stuck}
#   Plan: docs/35-pr-review-fix-loop-iteration-plan.md
set -uo pipefail

# ── Injectable dependencies ──────────────────────────────────────────────────────
ROOT="${PR_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
GH="${PR_GH:-gh}"
CLAUDE="${PR_CLAUDE:-claude}"
REMOTE="${PR_REMOTE:-origin}"
HEAD_GLOB="${PR_HEAD_GLOB:-agent/}"
REVIEWER_MODEL="${PR_REVIEWER_MODEL:-opus}"
FIXER_MODEL="${PR_FIXER_MODEL:-sonnet}"           # model F — must DIFFER from R (FR-075)
MAX_ROUNDS="${PR_MAX_ROUNDS:-4}"
GATES_CMD="${PR_GATES_CMD:-scripts/quality-gates.sh --only typecheck,lint,unit}"
DEPS_MODE="${PR_DEPS:-install}"                   # install | symlink (node_modules into the worktree)
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
LOCK="${PR_FIXER_LOCK:-/tmp/agent-pr-fixer-$NS.lock}"
LOGDIR="${PR_LOGDIR:-/tmp/agent-pr-review-$NS}"
WORKTREE_BASE="${PR_WORKTREE_BASE:-/tmp/agent-pr-review-$NS/worktrees}"

cd "$ROOT" || { echo "[pr-fixer] cannot cd to $ROOT" >&2; exit 2; }
mkdir -p "$LOGDIR" "$WORKTREE_BASE"
log() { printf '[pr-fixer] %s\n' "$*"; }

# ── Transient model-failure classification (issue #19) ───────────────────────────
# `claude -p --output-format json` can fail TRANSIENTLY — a session/usage limit, provider
# rate-limit, or overload — WITHOUT the model ever running. The CLI then emits an envelope like
#   {"is_error":true,"api_error_status":429,"result":"You've hit your session limit · resets …"}
# Such a failure is SELF-HEALING: the next timer tick retries once the limit resets, so it must
# NOT be escalated to a human (review-stuck) nor consume a fix round. It is distinct from a
# GENUINE failure — only the latter earns review-stuck. Prints: transient | hard | ok.
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

# Label ops via REST (gh pr edit --add-label hits the deprecated projectCards GraphQL field
# and flakily drops the label, docs/35). Non-fatal; add LOGGED on failure, remove tolerates 404.
add_label()    { "$GH" api -X POST   "repos/{owner}/{repo}/issues/$1/labels"     -f "labels[]=$2" >/dev/null 2>&1 || log "WARN: could not add label '$2' to #$1"; }
remove_label() { "$GH" api -X DELETE "repos/{owner}/{repo}/issues/$1/labels/$2"                   >/dev/null 2>&1 || true; }

# ── Toolchain bootstrap ──────────────────────────────────────────────────────────
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
[ -s "$HOME/miniconda3/etc/profile.d/conda.sh" ] && . "$HOME/miniconda3/etc/profile.d/conda.sh" >/dev/null 2>&1 || true
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
case ":$PATH:" in *":$PNPM_HOME:"*) ;; *) [ -d "$PNPM_HOME" ] && PATH="$PNPM_HOME:$PATH";; esac

# ── FR-075: the fixer must DIFFER from the reviewer ──────────────────────────────
if [ "$FIXER_MODEL" = "$REVIEWER_MODEL" ]; then
  log "REFUSING: PR_FIXER_MODEL ('$FIXER_MODEL') must DIFFER from PR_REVIEWER_MODEL (separation of duties)."
  exit 2
fi

# ── Preflight ───────────────────────────────────────────────────────────────────
for t in git jq "$GH" "$CLAUDE"; do
  command -v "$t" >/dev/null 2>&1 || { log "PREFLIGHT FAILED — not on PATH: $t"; exit 1; }
done

# ── Single-instance lock ─────────────────────────────────────────────────────────
exec 9>"$LOCK"
if ! flock -n 9; then log "another fixer run in progress — exiting"; exit 0; fi

# ── Find one PR with requested changes (not claimed/terminal) ────────────────────
prs_json="$("$GH" pr list --state open --label changes-requested \
  --json number,headRefName,labels,title --limit 30 2>/dev/null || echo '[]')"
[ -z "$prs_json" ] && prs_json='[]'
eligible="$(jq -c --arg pfx "$HEAD_GLOB" 'map(select(
  (.headRefName | startswith($pfx)) and
  ([.labels[]?.name] | index("fix-wip")         | not) and
  ([.labels[]?.name] | index("review-wip")      | not) and
  ([.labels[]?.name] | index("review-approved") | not) and
  ([.labels[]?.name] | index("review-stuck")    | not)
)) | .[0] // empty' <<<"$prs_json")"
if [ -z "$eligible" ]; then log "no PRs awaiting a fix"; exit 0; fi

n="$(jq -r '.number' <<<"$eligible")"
head="$(jq -r '.headRefName' <<<"$eligible")"
log "fixing PR #${n} (${head})"
add_label "$n" fix-wip; remove_label "$n" changes-requested

# ── Round cap: stop before attempting a fix we've already attempted MAX_ROUNDS times ──
round="$("$GH" pr view "$n" --json comments --jq '[.comments[].body | capture("pr-loop-round: (?<r>[0-9]+)").r | tonumber] | max // 0' 2>/dev/null || echo 0)"
[[ "$round" =~ ^[0-9]+$ ]] || round=0
if [ "$round" -ge "$MAX_ROUNDS" ]; then
  "$GH" pr comment "$n" -b "🛑 agent-pr-fixer: round cap (${round}/${MAX_ROUNDS}) reached — handing to a human." >/dev/null 2>&1 || true
  add_label "$n" review-stuck; remove_label "$n" fix-wip
  log "PR #${n} at round cap → review-stuck"
  exit 0
fi
next_round=$((round + 1))

# ── The reviewer's latest findings (its comment body) ────────────────────────────
review_body="$("$GH" pr view "$n" --json comments \
  --jq '[.comments[] | select(.body | test("agent-pr-reviewer: CHANGES REQUESTED"))] | last.body // ""' 2>/dev/null || echo "")"
[ -z "$review_body" ] && review_body="(no reviewer comment found — address any obvious gate failures)"

# ── Isolated worktree ON the PR head branch ──────────────────────────────────────
git fetch -q "$REMOTE" "$head" >/dev/null 2>&1 || true
wt="${WORKTREE_BASE}/pr-${n}"
git worktree remove --force "$wt" >/dev/null 2>&1 || true; rm -rf "$wt" >/dev/null 2>&1 || true
# DETACHED worktree at the remote head — NOT `-B <branch>`. A `-B` reset of the branch fails with
# "Cannot force update the current branch" when the PR branch happens to be checked out in the
# primary working copy (the repo gets parked on stray agent/* branches). Detached at the commit
# never touches the branch ref, so it works regardless; we push HEAD:<head> at the end.
if ! git worktree add -f --detach "$wt" "${REMOTE}/${head}" >/dev/null 2>&1; then
  log "could not create worktree on ${head}"
  "$GH" pr comment "$n" -b "⚠️ agent-pr-fixer: could not check out the PR branch — needs a human." >/dev/null 2>&1 || true
  add_label "$n" review-stuck; remove_label "$n" fix-wip
  exit 0
fi
cleanup() { cd "$ROOT" 2>/dev/null || true; git worktree remove --force "$wt" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cd "$wt"

# ── Provision deps the gates need (fresh worktree has no node_modules) ───────────
# Root-level pnpm install + explicit prisma generate (pnpm 10 blocks dependency build
# scripts, and the vitest suites import the generated Prisma client).
if [ -f "$ROOT/package.json" ] && [ -f "$wt/package.json" ]; then
  if [ "$DEPS_MODE" = "symlink" ]; then
    [ -d "$ROOT/node_modules" ] && [ ! -e "$wt/node_modules" ] && ln -s "$ROOT/node_modules" "$wt/node_modules" 2>/dev/null || true
  elif [ -f "$wt/pnpm-lock.yaml" ]; then
    ( cd "$wt" && pnpm install --frozen-lockfile --prefer-offline --silent ) >>"${LOGDIR}/deps-${n}.log" 2>&1 || true
  else
    ( cd "$wt" && pnpm install --prefer-offline --silent ) >>"${LOGDIR}/deps-${n}.log" 2>&1 || true
  fi
  [ "$DEPS_MODE" = "symlink" ] || ( cd "$wt" && pnpm exec prisma generate ) >>"${LOGDIR}/deps-${n}.log" 2>&1 || true
fi
[ -f pnpm-lock.yaml ] && git checkout -q -- pnpm-lock.yaml 2>/dev/null || true

# ── Drive the fix headlessly (model F) ───────────────────────────────────────────
prompt="$(cat <<EOF
You are agent-pr-fixer, working UNATTENDED in an isolated git worktree on branch '${head}'.
A reviewer (a different model) requested the changes below on this PR. Address EACH finding:
either change the code to fix it, OR, if the reviewer is mistaken, leave the code and note why.
Add or update tests for each behavioural fix. Keep the change SCOPED to the findings — do not
make unrelated changes. Work ONLY in this worktree; do NOT push. When finished, stop.

=== REVIEWER FINDINGS ===
${review_body}
EOF
)"
log "running fixer model ${FIXER_MODEL} in ${wt}…"
fix_log="${LOGDIR}/agent-fix-${n}.json"
"$CLAUDE" -p "$prompt" --permission-mode bypassPermissions --model "$FIXER_MODEL" --output-format json \
  >"$fix_log" 2>&1 || log "fixer model exited non-zero — proceeding to gates"

# ── Transient failure (rate/usage limit, overload) → the model never ran, so it produced no fix.
# Restore the PR to changes-requested and retry on the next tick — do NOT escalate to review-stuck
# and do NOT consume a round. MUST come BEFORE the "no code changes" branch (a transient run leaves
# the worktree untouched, which would otherwise be misread as "nothing to fix" and burn a round). ─
if [ "$(classify_model_result "$fix_log")" = "transient" ]; then
  log "fixer model hit a transient limit (rate-limit/usage-limit/overload) — leaving PR #${n} as changes-requested; retry next tick (round NOT consumed)"
  add_label "$n" changes-requested; remove_label "$n" fix-wip
  exit 0
fi

# Commit what the agent changed (worktree only). Strip provisioned node_modules/env.
git add -A
git reset -q -- node_modules .env .env.local .env.staging.local .env.production.local 2>/dev/null || true
if git diff --cached --quiet; then
  log "fixer produced no code changes"
  "$GH" pr comment "$n" -b "ℹ️ agent-pr-fixer (round ${next_round}): no code changes — the reviewer's points may be replies/justifications. Re-review.
<!-- pr-loop-round: ${next_round} -->" >/dev/null 2>&1 || true
  add_label "$n" review-needed; remove_label "$n" fix-wip
  exit 0
fi
git commit -q -m "fix(pr #${n}): address review findings (round ${next_round})

Co-Authored-By: Claude <noreply@anthropic.com>"

# ── Provision local env-files the gates need (AFTER the commit, so never committed) ──
shopt -s nullglob
for src in "$ROOT"/.env "$ROOT"/.env.local "$ROOT"/.env.staging.local "$ROOT"/.env.production.local; do
  [ -e "$src" ] || continue
  rel="${src#"$ROOT"/}"; dst="$wt/$rel"
  [ -e "$dst" ] || { mkdir -p "$(dirname "$dst")" && ln -s "$src" "$dst" 2>/dev/null; } || true
done
shopt -u nullglob

# ── Re-run the gates: NEVER push red ─────────────────────────────────────────────
log "re-running gates: ${GATES_CMD}"
if bash -c "$GATES_CMD" >"${LOGDIR}/gates-${n}.log" 2>&1; then
  # Detached HEAD → push the commit to the remote PR branch explicitly (HEAD:<head>).
  git push "$REMOTE" "HEAD:${head}" >/dev/null 2>&1 || log "push failed"
  "$GH" pr comment "$n" -b "$(printf '🔧 agent-pr-fixer (model %s, round %s): addressed the findings — gates green, pushed. Re-review please.\n<!-- pr-loop-round: %s -->' "$FIXER_MODEL" "$next_round" "$next_round")" >/dev/null 2>&1 || true
  add_label "$n" review-needed; remove_label "$n" fix-wip
  log "PR #${n} fixed + gates green → review-needed (round ${next_round})"
else
  "$GH" pr comment "$n" -b "$(printf '🛑 agent-pr-fixer: the fix did not pass the gates (not pushed) — needs a human.\n\n```\n%s\n```' "$(tail -25 "${LOGDIR}/gates-${n}.log")")" >/dev/null 2>&1 || true
  add_label "$n" review-stuck; remove_label "$n" fix-wip
  log "PR #${n} fix failed gates → review-stuck (not pushed)"
fi
exit 0
