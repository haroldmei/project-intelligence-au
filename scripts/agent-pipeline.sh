#!/usr/bin/env bash
# agent-pipeline.sh — SEQUENTIAL, per-issue orchestrator for the agent build loop.
#
# The four stages (inbox / pr-reviewer / pr-fixer / pr-merger) used to run on four independent
# timers, each fanning out across its whole queue: the inbox built EVERY pending issue, then the
# reviewer reviewed EVERY PR, then the merger merged EVERY PR. A delivered PR was never picked up
# by the "next issue" — the stages just churned their own backlogs in parallel.
#
# This driver makes ONE issue flow end-to-end before the next is even started:
#   1. pick + build ONE issue → PR            (agent-inbox.sh)
#   2. drive that PR through review ⇄ fix      (agent-pr-reviewer.sh / agent-pr-fixer.sh)
#   3. merge it to main                        (agent-pr-merger.sh)
#   4. CLOSE the issue                         (the merger doesn't; there's no Closes-keyword)
#   …then the next timer tick starts again at step 1 with the next issue.
#
# It does NOT deploy. deploy-on-merge is disabled; the local stack is rebuilt BY HAND.
#
# One run advances the in-flight issue toward a terminal state (merged / *-stuck / needs-human)
# and is re-invoked by a single timer; a flock guarantees one instance. Stage scripts and gh are
# injectable so the journey is testable hermetically (scripts/agent-pipeline.test.sh).
#
#   Setup: scripts/agent-pr-loop-setup.sh (timers)  ·  Docs: docs/AGENT-HARNESS.md
set -uo pipefail

# ── Injectable dependencies (defaults = production; tests override) ───────────────
ROOT="${AGENT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
GH="${AGENT_GH:-gh}"
GIT="${AGENT_GIT:-git}"
REMOTE="${AGENT_REMOTE:-origin}"
BASE="${AGENT_BASE:-main}"
HEAD_GLOB="${PIPELINE_HEAD_GLOB:-agent/}"           # only our agent-authored branches
INBOX="${PIPELINE_INBOX:-$ROOT/scripts/agent-inbox.sh}"
REVIEWER="${PIPELINE_REVIEWER:-$ROOT/scripts/agent-pr-reviewer.sh}"
FIXER="${PIPELINE_FIXER:-$ROOT/scripts/agent-pr-fixer.sh}"
MERGER="${PIPELINE_MERGER:-$ROOT/scripts/agent-pr-merger.sh}"
MAX_ROUNDS="${PIPELINE_MAX_ROUNDS:-10}"             # review⇄fix⇄merge rounds before giving up this run
REARM_MAX="${PIPELINE_REARM_MAX:-3}"                # how many times a stuck PR may be re-armed as main advances

agent_repo_ns() {
  local d; d="$(git -C "$ROOT" rev-parse --git-common-dir 2>/dev/null)" || return 1
  [ -n "$d" ] || return 1
  d="$(cd "$ROOT" 2>/dev/null && cd "$d" 2>/dev/null && pwd)" || return 1
  printf '%s' "$d" | sha1sum | cut -c1-12
}
NS="$(agent_repo_ns || true)"; [ -n "$NS" ] || NS="nogit"
LOCK="${PIPELINE_LOCK:-/tmp/agent-pipeline-$NS.lock}"
LOGDIR="${PIPELINE_LOGDIR:-/tmp/agent-pipeline-$NS}"

cd "$ROOT" || { echo "[pipeline] cannot cd to $ROOT" >&2; exit 2; }
mkdir -p "$LOGDIR"
log() { printf '[pipeline] %s\n' "$*"; }

# ── Toolchain bootstrap — systemd/cron start from a BARE env (no ~/.bashrc); source the tool
# managers so node/npx/python match an interactive shell (same gap the stage scripts handle). ─
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
[ -s "$HOME/miniconda3/etc/profile.d/conda.sh" ] && . "$HOME/miniconda3/etc/profile.d/conda.sh" >/dev/null 2>&1 || true
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
case ":$PATH:" in *":$PNPM_HOME:"*) ;; *) [ -d "$PNPM_HOME" ] && PATH="$PNPM_HOME:$PATH";; esac

# ── Single-instance lock — never two pipelines against the same repo ─────────────
exec 9>"$LOCK"
if ! flock -n 9; then log "another pipeline run in progress — exiting"; exit 0; fi

# Open agent PRs in a DRIVEABLE state (review-needed / changes-requested / review-approved),
# excluding ones already parked at a human-needed terminal (*-stuck). One per line.
active_prs() {
  "$GH" pr list --state open --json number,headRefName,labels --limit 50 2>/dev/null \
    | jq -r --arg g "$HEAD_GLOB" '
        [ .[]
          | select(.headRefName | startswith($g))
          | ([.labels[].name]) as $l
          | select($l | any(. == "review-needed" or . == "changes-requested" or . == "review-approved"))
          | select(($l | any(. == "review-stuck" or . == "merge-stuck")) | not)
          | .number ] | .[]' 2>/dev/null
}

# Issue numbers behind the currently-driveable PRs (branch agent/issue-<N> → <N>).
inflight_issues() {
  "$GH" pr list --state open --json headRefName,labels --limit 50 2>/dev/null \
    | jq -r --arg g "$HEAD_GLOB" '
        .[] | select(.headRefName | startswith($g))
            | ([.labels[].name]) as $l
            | select($l | any(. == "review-needed" or . == "changes-requested" or . == "review-approved"))
            | .headRefName' 2>/dev/null | sed -E 's#.*/issue-##' | grep -E '^[0-9]+$' || true
}

run_stage() { # <script> <logname>
  if [ ! -x "$1" ] && [ ! -f "$1" ]; then log "stage missing: $1 — skipping"; return 0; fi
  AGENT_GH="$GH" bash "$1" >>"${LOGDIR}/$2.log" 2>&1 || log "stage '$2' exited non-zero (continuing)"
}

# ── Re-arm stuck PRs when main advances ──────────────────────────────────────────
# `review-stuck` / `merge-stuck` are excluded from active_prs, so a PR parked there ROTS even
# after `main` moves on and resolves whatever blocked it — e.g. PR #139 (issue #110) was stuck
# on a missing test fixture that a SIBLING PR later added to conftest, so its tests now pass but
# nothing re-checked it. When origin/main has advanced PAST a stuck PR's branch, give it ONE
# fresh attempt at this main SHA: review-stuck → review-needed (re-review), merge-stuck →
# review-approved (re-merge). Bounded by REARM_MAX total AND at most once per main SHA (a
# `<!-- rearm: <sha> -->` marker comment), so a permanently-broken PR can't loop forever.
rearm_stuck_prs() {
  "$GIT" -C "$ROOT" fetch -q "$REMOTE" >/dev/null 2>&1 || true
  local main_sha; main_sha="$("$GIT" -C "$ROOT" rev-parse --short "$REMOTE/$BASE" 2>/dev/null)" || return 0
  [ -n "$main_sha" ] || return 0
  local stuck; stuck="$("$GH" pr list --state open --json number,headRefName,labels --limit 50 2>/dev/null \
    | jq -r --arg g "$HEAD_GLOB" '.[] | select(.headRefName|startswith($g))
        | select([.labels[].name] | any(.=="review-stuck" or .=="merge-stuck"))
        | "\(.number)\t\(.headRefName)\t\([.labels[].name]|join(","))"' 2>/dev/null)"
  [ -n "$stuck" ] || return 0
  local num branch labels behind rearms last
  while IFS=$'\t' read -r num branch labels; do
    [ -n "$num" ] || continue
    behind="$("$GIT" -C "$ROOT" rev-list --count "$REMOTE/$branch..$REMOTE/$BASE" 2>/dev/null || echo 0)"
    [ "${behind:-0}" -gt 0 ] || continue          # main hasn't advanced past this branch → nothing new to try
    # Read the re-arm count fail-closed: a transient `gh` error must NOT reset it to 0 (the old
    # `|| echo 0` did exactly that, silently defeating REARM_MAX and letting a permanently-broken
    # PR be re-armed every tick). If we can't read a clean integer, skip re-arming this tick.
    rearms="$("$GH" pr view "$num" --json comments --jq '[.comments[]|select(.body|contains("<!-- rearm:"))]|length' 2>/dev/null)"
    if ! [[ "$rearms" =~ ^[0-9]+$ ]]; then log "PR #${num}: could not read re-arm count (gh error) — skipping re-arm this tick (fail-closed)"; continue; fi
    if [ "$rearms" -ge "$REARM_MAX" ]; then log "PR #${num}: re-arm budget exhausted (${rearms}/${REARM_MAX}) — leaving stuck"; continue; fi
    last="$("$GH" pr view "$num" --json comments --jq '[.comments[].body|capture("rearm: (?<s>[0-9a-f]+)").s]|last // ""' 2>/dev/null)"
    [ "$last" = "$main_sha" ] && continue          # already re-armed at THIS main SHA → don't spam every tick
    log "re-arming stuck PR #${num} (${labels}) — ${BASE} advanced to ${main_sha}, branch ${behind} behind"
    if printf '%s' "$labels" | grep -q merge-stuck; then
      do_gh_rest DELETE "issues/${num}/labels/merge-stuck"; do_gh_rest POST "issues/${num}/labels" review-approved
    else
      do_gh_rest DELETE "issues/${num}/labels/review-stuck"; do_gh_rest POST "issues/${num}/labels" review-needed
    fi
    "$GH" pr comment "$num" -b "$(printf '🔄 agent-pipeline: \`%s\` advanced to %s (this branch was %s commit(s) behind); the blocker may be resolved — re-arming for a fresh attempt (%s/%s). <!-- rearm: %s -->' "$BASE" "$main_sha" "$behind" "$((rearms+1))" "$REARM_MAX" "$main_sha")" >/dev/null 2>&1 || true
  done <<< "$stuck"
}
# Label add/remove via REST (gh's --add-label hits the deprecated projectCards GraphQL field).
do_gh_rest() { # <POST|DELETE> <path-after-repo> [label-for-POST]
  if [ "$1" = POST ]; then "$GH" api -X POST "repos/{owner}/{repo}/$2" -f "labels[]=$3" >/dev/null 2>&1 || true
  else "$GH" api -X DELETE "repos/{owner}/{repo}/$2" >/dev/null 2>&1 || true; fi
}

# ── Phase 0 — re-arm any stuck PRs that main has advanced past (their blocker may be resolved). ─
[ "${PIPELINE_REARM:-1}" = 1 ] && rearm_stuck_prs

# ── Phase 1 — STRICT SERIAL: only build a new issue when nothing is in flight. If a PR is still
# being reviewed/fixed/merged, finish IT first (e.g. a leftover from the old parallel timers). ─
target_issues=""
if [ -n "$(active_prs)" ]; then
  log "in-flight PR(s) present — draining them before building a new issue"
  target_issues="$(inflight_issues)"
else
  log "no in-flight PR — building the next issue"
  # Truncate the inbox log FIRST so the post-run scrape reads only THIS tick. run_stage appends
  # (`>>`), so without this a tick whose inbox claims nothing would `tail -1` a stale "claiming
  # issue #N" line from a PRIOR tick and mis-target an already-built issue. (flock ⇒ single writer.)
  : > "${LOGDIR}/inbox.log"
  run_stage "$INBOX" inbox
  target_issues="$(grep -oE 'claiming issue #[0-9]+' "${LOGDIR}/inbox.log" 2>/dev/null | tail -1 | grep -oE '[0-9]+' || true)"
  [ -n "$target_issues" ] && log "built issue #${target_issues}" || log "inbox produced no PR (no eligible issue, or routed to needs-human/blocked)"
fi

# ── Phase 2 — drive the in-flight PR(s) review ⇄ fix → merge until terminal (bounded). ──
for ((r=1; r<=MAX_ROUNDS; r++)); do
  prs="$(active_prs)"
  if [ -z "$prs" ]; then log "no driveable PRs left — done after $((r-1)) round(s)"; break; fi
  log "round ${r}: driving PR(s) $(echo "$prs" | tr '\n' ' ')"
  run_stage "$REVIEWER" reviewer
  run_stage "$FIXER"    fixer
  run_stage "$MERGER"   merger
  [ "$r" -eq "$MAX_ROUNDS" ] && log "hit MAX_ROUNDS=$MAX_ROUNDS — leaving remainder for the next tick"
done

# ── Phase 3 — RECONCILE: close every OPEN issue whose agent PR has merged. The merger lands
# commits on main (GitHub auto-closes the PR as merged) but does NOT close the issue, and the PR
# carries no Closes-keyword — so we close it here. This is a STATELESS sweep, independent of
# target_issues, so it self-heals three failure modes the old this-run-only close could not:
#   (1) the post-merge index race — `pr list --state merged` can still read 0 in the seconds after
#       the merger lands the PR, silently skipping the close; next tick the index has caught up;
#   (2) a transient `gh issue close` failure — the issue stays open+`done`, retried next tick;
#   (3) a PR merged outside this run (e.g. by a human) — never in target_issues, but still swept.
# Candidates = OPEN issues marked `done` (the inbox's "PR opened" signal, set BEFORE merge) ∪ the
# issues we drove this run. Idempotent; closed issues drop out, so the set stays small. ──
close_candidates="$(
  { "$GH" issue list --state open --label done --json number --jq '.[].number' 2>/dev/null
    printf '%s\n' $target_issues
  } | grep -E '^[0-9]+$' | sort -u)"
for n in $close_candidates; do
  # Confirm the PR shipped via the merger's `merged` LABEL — the only reliable signal here.
  # The merger REBASES approved PRs onto an integration branch and FAST-FORWARDS `main`
  # (agent-pr-merger.sh) instead of using GitHub's merge, so a shipped PR's GitHub state is
  # `CLOSED` (not `MERGED`) with a null mergeCommit; it stamps `merged` only on a successful
  # fast-forward. `--head …issue-<N> --state all` matches the PR by its immutable head ref —
  # even after the branch is deleted — so this is independent of GitHub PR state, branch
  # existence, AND any issue comment. It closes inbox-built and manually-recovered strays alike.
  # (Earlier tries used `--state merged` — misses CLOSED rebase-ff PRs — and a `PR:…/pull/N`
  # issue comment only the inbox writes — misses manual PRs; both could strand `done` issues.)
  shipped="$("$GH" pr list --head "${HEAD_GLOB}issue-${n}" --state all --json labels \
    --jq 'map(select([.labels[].name] | index("merged"))) | length' 2>/dev/null || echo 0)"
  [ "${shipped:-0}" -ge 1 ] || continue
  state="$("$GH" issue view "$n" --json state --jq '.state' 2>/dev/null || echo CLOSED)"
  [ "$state" = "OPEN" ] || continue
  "$GH" issue close "$n" -c "✅ agent-pipeline: PR merged into main; closing the issue. (Deploy is manual — not triggered.)" >/dev/null 2>&1 \
    && log "closed issue #${n} (PR merged)" || log "WARN: could not close issue #${n} — will retry next tick"
done

log "pipeline run complete"
