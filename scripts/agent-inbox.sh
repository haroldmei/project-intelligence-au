#!/usr/bin/env bash
# agent-inbox.sh — the unattended "requirement inbox → build → PR" runner.
#
# Phone-friendly loop: you file a GitHub issue labelled `agent` from the GitHub
# mobile app; a systemd user timer calls this every couple of minutes; it picks
# ONE pending issue, builds it headlessly via `claude -p` (which invokes the project
# orchestrators — `iterate` for a change, `build-product-v2` for a new product), runs
# the project quality gates, and — only if green — pushes a branch + opens a PR +
# comments the link back on the issue. Never pushes to main.
#
# ISOLATION (important): the build runs in a DEDICATED git WORKTREE off origin/main,
# never in your primary working copy. So it can never switch your branch or sweep your
# uncommitted WIP — you can keep developing in the repo while a build runs.
#
# Single-pass by design (the timer re-invokes it); one requirement per run; a flock
# guarantees a single instance. Every external command + path is overridable via env
# so the journey is testable hermetically (scripts/agent-inbox.test.sh) with NO real
# GitHub side-effects and NO LLM cost.
#
#   Labels used: `agent` (inbox), `wip` (claimed), `done` (PR opened), `needs-human`.
#   Setup: scripts/agent-inbox-setup.sh  ·  Docs: docs/AGENT-HARNESS.md
set -uo pipefail

# ── Injectable dependencies (defaults = production; tests override) ──────────────
ROOT="${AGENT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
GH="${AGENT_GH:-gh}"                       # GitHub CLI (stubbed in tests)
CLAUDE="${AGENT_CLAUDE:-claude}"           # Claude Code CLI (stubbed in tests)
BASE="${AGENT_BASE:-main}"                 # base branch for PRs
REMOTE="${AGENT_REMOTE:-origin}"           # git remote
LABEL="${AGENT_LABEL:-agent}"             # inbox label
MODEL="${AGENT_MODEL:-opus}"               # claude model alias
GATES_CMD="${AGENT_GATES_CMD:-scripts/quality-gates.sh --only typecheck,lint,unit}"  # safety net
PUSH_RETRIES="${AGENT_PUSH_RETRIES:-3}"    # `git push` attempts before handing back (transient blips)
PUSH_RETRY_DELAY="${AGENT_PUSH_RETRY_DELAY:-5}"  # base backoff seconds between push attempts (×attempt)
# ── Per-repo namespace — so two inboxes in DIFFERENT repos never collide on a global /tmp
# lock (or clobber each other's logs/worktrees). The git common dir is stable across a repo's
# own worktrees yet unique per repo; resolve it to an ABSOLUTE path because `--git-common-dir`
# returns a bare ".git" at a repo root (every repo would hash identically otherwise). Two
# inboxes of the SAME repo still share the key → still serialize. All paths stay overridable.
agent_repo_ns() {
  local d
  d="$(git -C "$ROOT" rev-parse --git-common-dir 2>/dev/null)" || return 1
  [ -n "$d" ] || return 1
  d="$(cd "$ROOT" 2>/dev/null && cd "$d" 2>/dev/null && pwd)" || return 1
  printf '%s' "$d" | sha1sum | cut -c1-12
}
NS="$(agent_repo_ns || true)"; [ -n "$NS" ] || NS="nogit"
LOCK="${AGENT_LOCK:-/tmp/agent-inbox-$NS.lock}"
LOGDIR="${AGENT_LOGDIR:-/tmp/agent-inbox-$NS}"
WORKTREE_BASE="${AGENT_WORKTREE_BASE:-/tmp/agent-inbox-$NS/worktrees}"   # isolated build dirs

cd "$ROOT" || { echo "[agent-inbox] cannot cd to $ROOT" >&2; exit 2; }
mkdir -p "$LOGDIR" "$WORKTREE_BASE"
log() { printf '[agent-inbox] %s\n' "$*"; }

# Add a label via the REST issues/labels endpoint. `gh pr edit --add-label` hits the
# deprecated classic-Projects `projectCards` GraphQL field and flakily errors, silently
# dropping the label (the bug that left PRs un-enrolled from the review loop, docs/35).
# REST avoids it. Non-fatal but LOGGED (no silent failure). `{owner}/{repo}` auto-resolve.
add_label() { # <issue-or-pr-number> <label>
  "$GH" api -X POST "repos/{owner}/{repo}/issues/$1/labels" -f "labels[]=$2" >/dev/null 2>&1 \
    || log "WARN: could not add label '$2' to #$1"
}

# ── Toolchain bootstrap — systemd/cron start from a BARE environment (no ~/.bashrc,
# no nvm/conda init), so tools placed on PATH by shell init (node/npx via nvm, conda
# tools, …) are MISSING and the gates die "command not found". Source the tool managers
# here so the build env matches an interactive shell, however this script is launched. ─
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
[ -s "$HOME/miniconda3/etc/profile.d/conda.sh" ] && . "$HOME/miniconda3/etc/profile.d/conda.sh" >/dev/null 2>&1 || true
# pnpm (app-shell uses it) lives in PNPM_HOME, exported only by ~/.bashrc — add it too.
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
case ":$PATH:" in *":$PNPM_HOME:"*) ;; *) [ -d "$PNPM_HOME" ] && PATH="$PNPM_HOME:$PATH";; esac

# ── Preflight — fail LOUD + early on a missing/unhealthy dependency. A clear message
# beats a cryptic gate failure 3 layers down (the npx-not-found / wrong-tsc traps). ─
PREFLIGHT_TOOLS="${AGENT_PREFLIGHT_TOOLS:-git jq node npx pnpm docker}"
missing=""
for t in $PREFLIGHT_TOOLS "$GH" "$CLAUDE"; do
  command -v "$t" >/dev/null 2>&1 || missing="${missing} ${t}"
done
if [ -n "$missing" ]; then
  log "PREFLIGHT FAILED — not on PATH:${missing}"
  log "  systemd/cron use a bare env; ensure nvm/conda/pnpm init is sourced (see docs/AGENT-HARNESS.md)."
  exit 1
fi
# Docker's CLI being on PATH ≠ the daemon being reachable — the e2e gate needs the daemon.
case " $PREFLIGHT_TOOLS " in *" docker "*)
  if ! docker info >/dev/null 2>&1; then
    log "PREFLIGHT FAILED — docker CLI present but the daemon is unreachable"
    log "  start Docker Desktop / check the socket (the unit gate boots the test Postgres)."
    exit 1
  fi ;;
esac

# ── Single-instance lock — never run two builds against the same repo/stack ─────
log "single-instance lock: $LOCK"
exec 9>"$LOCK"
if ! flock -n 9; then log "another run in progress — exiting"; exit 0; fi

# ── Find pending work: open `agent` issues not already claimed/finished ──────────
issues_json="$("$GH" issue list --label "$LABEL" --state open \
  --json number,title,body,labels --limit 20 2>/dev/null || echo '[]')"
[ -z "$issues_json" ] && issues_json='[]'

# ── Auto-unblock: an issue the triage marked `blocked` re-queues itself once the blocker
# it was waiting on closes. This is what makes the loop "continue" after a self-filed infra/
# test fix lands — without it, blocked issues would sit forever. Best-effort + cheap: only
# blocked issues are inspected; each names its blocker in a "blocked by #N" comment. ─
reconcile_blocked() {
  local blocked nums b blocker st
  blocked="$(jq -r 'map(select([.labels[]?.name] | index("blocked"))) | .[].number' <<<"$issues_json" 2>/dev/null)"
  [ -n "$blocked" ] || return 0
  for b in $blocked; do
    # newest "blocked by #N" wins (an issue can be re-blocked behind a different blocker).
    blocker="$("$GH" issue view "$b" --json comments \
      --jq '[.comments[].body | capture("blocked by #(?<n>[0-9]+)"; "g").n] | last // empty' 2>/dev/null)"
    [ -n "$blocker" ] || continue
    st="$("$GH" issue view "$blocker" --json state --jq '.state' 2>/dev/null)"
    if [ "$st" = "CLOSED" ]; then
      log "unblocking #${b}: blocker #${blocker} is closed"
      "$GH" api -X DELETE "repos/{owner}/{repo}/issues/${b}/labels/blocked" >/dev/null 2>&1 || true
      "$GH" issue comment "$b" -b "🔓 agent-inbox: unblocked — #${blocker} closed; re-queued for a fresh build." >/dev/null 2>&1 || true
    fi
  done
  # refresh the snapshot so a just-unblocked issue is eligible THIS tick
  issues_json="$("$GH" issue list --label "$LABEL" --state open \
    --json number,title,body,labels --limit 20 2>/dev/null || echo "$issues_json")"
}
[ "${AGENT_RECONCILE:-1}" = 1 ] && reconcile_blocked

eligible="$(jq -c 'map(select(
  ([.labels[]?.name] | index("wip")         | not) and
  ([.labels[]?.name] | index("done")        | not) and
  ([.labels[]?.name] | index("needs-human") | not) and
  ([.labels[]?.name] | index("blocked")     | not)
)) | .[0] // empty' <<<"$issues_json")"

if [ -z "$eligible" ]; then log "no pending requirements"; exit 0; fi

n="$(jq -r '.number' <<<"$eligible")"
title="$(jq -r '.title' <<<"$eligible")"
body="$(jq -r '.body // ""' <<<"$eligible")"

# ── Epic / tracking-issue guard ──────────────────────────────────────────────────
# An epic is a checklist of child tickets, not a single buildable requirement. Handed
# one, a less-capable driver flails — issue #1077 saw it inject a logic-inverting bug into
# error_classification.py and rewrite unrelated harness files rather than no-op. Detect the
# repo's epic convention (an `[Epic]` title, an "epic / tracking issue" body, or the explicit
# "intentionally not labeled `agent`" marker) and de-queue: drop `${LABEL}` so it is not
# re-picked, and point at the child tickets. Conservative on purpose (specific markers only,
# so a normal ticket is never caught). Disable with AGENT_EPIC_GUARD=0. ─
if [ "${AGENT_EPIC_GUARD:-1}" = 1 ] && {
     grep -qiE '^[[:space:]]*\[epic\]' <<<"$title" ||
     grep -qiE 'epic[[:space:]]*/[[:space:]]*tracking|tracking issue' <<<"$title"$'\n'"$body" ||
     grep -qiE 'intentionally [^[:space:]]*not[^[:space:]]* labeled' <<<"$body"; }; then
  log "issue #${n}: epic/tracking issue — de-queuing (not a buildable ticket)"
  "$GH" issue comment "$n" -b "🛑 agent-inbox: this looks like an **epic / tracking issue**, not a single buildable ticket, so I won't auto-build it (removing \`${LABEL}\`). Dispatch the individual child tickets by adding \`${LABEL}\` to *those* instead." >/dev/null 2>&1 || true
  "$GH" api -X DELETE "repos/{owner}/{repo}/issues/${n}/labels/${LABEL}" >/dev/null 2>&1 || true
  exit 0
fi

branch="agent/issue-${n}"
wt="${WORKTREE_BASE}/issue-${n}"
log "claiming issue #${n}: ${title} → ${branch} (isolated worktree)"

"$GH" issue edit "$n" --add-label wip >/dev/null 2>&1 || true
"$GH" issue comment "$n" -b "🤖 agent-inbox: starting on \`${branch}\` (isolated worktree)…" >/dev/null 2>&1 || true

# ── Isolated worktree off the latest base — NEVER touches the primary working copy ─
git fetch -q "$REMOTE" "$BASE" >/dev/null 2>&1 || true
base_ref="${REMOTE}/${BASE}"
git rev-parse --verify -q "$base_ref" >/dev/null || base_ref="$BASE"

# Remove any stale worktree/branch from a prior attempt, then create a fresh one.
git worktree remove --force "$wt" >/dev/null 2>&1 || true
rm -rf "$wt" >/dev/null 2>&1 || true
if ! git worktree add -f -B "$branch" "$wt" "$base_ref" >/dev/null 2>&1; then
  log "issue #${n}: could not create worktree"
  "$GH" issue comment "$n" -b "⚠️ agent-inbox: could not create an isolated build worktree — needs a human." >/dev/null 2>&1 || true
  "$GH" issue edit "$n" --add-label needs-human --remove-label wip >/dev/null 2>&1 || true
  exit 0
fi
# Always clean the worktree up at the end (the branch ref persists for the PR / inspection).
cleanup() { cd "$ROOT" 2>/dev/null || true; git worktree remove --force "$wt" >/dev/null 2>&1 || true; }
trap cleanup EXIT

cd "$wt"   # ── all build work happens HERE, in isolation ──

# ── Provision dependencies — a fresh worktree has NO node_modules (git ignores them),
# so the gates' `npx tsc`/lint/unit would fail / fetch the WRONG `tsc`.
#   AGENT_DEPS=install (default): a fresh per-service install IN the worktree — immune
#     to host node_modules drift (the corruption class that broke earlier builds), fast
#     with a warm pnpm/npm cache, and correctly handles requirements that ADD a dep.
#   AGENT_DEPS=symlink: reuse the host's node_modules (instant, but only as healthy as
#     the host install). ─
# Root-level pnpm app (Next.js/TS): the gates' tsc/eslint/vitest need node_modules and
# a generated Prisma client in the worktree.
deps_mode="${AGENT_DEPS:-install}"
if [ -f "$ROOT/package.json" ] && [ -f "$wt/package.json" ]; then
  if [ "$deps_mode" = "symlink" ]; then
    [ -d "$ROOT/node_modules" ] && [ ! -e "$wt/node_modules" ] && ln -s "$ROOT/node_modules" "$wt/node_modules" 2>/dev/null || true
  elif [ -f "$wt/pnpm-lock.yaml" ]; then
    ( cd "$wt" && pnpm install --frozen-lockfile --prefer-offline --silent ) >>"${LOGDIR}/deps-${n}.log" 2>&1 || log "deps: pnpm install failed (see deps-${n}.log)"
  else
    ( cd "$wt" && pnpm install --prefer-offline --silent ) >>"${LOGDIR}/deps-${n}.log" 2>&1 || log "deps: pnpm install failed (see deps-${n}.log)"
  fi
  # pnpm 10 blocks dependency build scripts, so @prisma/client's postinstall generate may
  # not have run in a fresh install — the vitest suites import the generated client.
  [ "$deps_mode" = "symlink" ] || ( cd "$wt" && pnpm exec prisma generate ) >>"${LOGDIR}/deps-${n}.log" 2>&1 || true
fi

# Discard install-induced lockfile churn so it never lands in the PR. node_modules is
# already installed; if the agent genuinely adds a dependency it re-modifies the lockfile
# LATER (during the build below) — a real change that SHOULD be in the PR — so we only
# drop the spurious provisioning diff here.
[ -f pnpm-lock.yaml ] && git checkout -q -- pnpm-lock.yaml 2>/dev/null || true

# ── Self-repair feedback: if a PRIOR build of this issue failed its gate, the triage left a
# `<!-- self-repair -->` comment with the failure log and re-queued it. Feed that log back into
# the prompt so this attempt fixes the ROOT CAUSE instead of repeating the same failure. ─
retry_context=""
prior_fail="$("$GH" issue view "$n" --json comments \
  --jq '[.comments[] | select(.body | contains("<!-- self-repair -->"))] | last.body // empty' 2>/dev/null || true)"
if [ -n "$prior_fail" ]; then
  log "issue #${n}: re-building WITH prior gate-failure context (self-repair)"
  retry_context="$(cat <<EOF

## ⚠ A PREVIOUS BUILD OF THIS ISSUE FAILED THE QUALITY GATE
Do NOT just repeat your previous diff. Read the failure below and fix the ROOT CAUSE. The
failing test is often CORRECT and exposing a PRE-EXISTING bug in code you did not write — fix
THAT (the real defect), not only your own change. Prior attempt's failure:

${prior_fail}
EOF
)"
fi

# ── Drive the build headlessly (the orchestrators do the real work) ─────────────
prompt="$(cat <<EOF
You are the ProjectIntelligence build agent, running UNATTENDED in an isolated git worktree
on branch '${branch}'. ProjectIntelligence ("DA Digest") is an existing, deployed product —
the Sunday-night development-application (DA) lead digest for Sydney tradies: Next.js 15 App
Router + TypeScript (routes in src/app, services in src/modules), Prisma/Postgres (prisma/),
Lucia auth, Stripe billing, Resend email; the package manager is pnpm. Implement the
requirement below by invoking the \`iterate\` skill (the cold-start refinement loop for an
existing product). Work ONLY in this worktree on this branch — do NOT push, and never touch
'${BASE}'. Add or update tests (backend vitest under __tests__, component vitest next to the
component, Playwright e2e under e2e/) for what you build. When finished, stop.

REQUIREMENT (issue #${n}): ${title}

${body}
${retry_context}
EOF
)"
log "invoking agent (model ${MODEL}) in ${wt}…"
# AGENT_CLAUDE_ARGS = extra flags for cost/time control, e.g. "--max-turns 40" (verify
# against `claude --help`). Empty by default; word-split intentionally.
read -ra CLAUDE_EXTRA <<<"${AGENT_CLAUDE_ARGS:-}"
"$CLAUDE" -p "$prompt" \
  --permission-mode bypassPermissions \
  --model "$MODEL" \
  --output-format json \
  "${CLAUDE_EXTRA[@]}" \
  >"${LOGDIR}/agent-${n}.json" 2>&1 || log "agent exited non-zero — proceeding to gates"

# Commit anything the agent left uncommitted (worktree only — your main copy is untouched).
# Unstage the provisioned symlinks first so they NEVER land in the PR: git's
# `node_modules/` ignore (directory-only) does not match a *symlink* named node_modules,
# so a bare `git add -A` would track them. (.env/.gcp are provisioned after this, below.)
git add -A
git reset -q -- node_modules .env .env.local .env.staging.local .env.production.local 2>/dev/null || true
git diff --cached --quiet || git commit -q -m "agent: issue #${n} — ${title}"

# ── No-op guard: if the agent produced nothing, hand back to a human ────────────
if [ -z "$(git rev-list "${base_ref}..HEAD" 2>/dev/null)" ]; then
  log "issue #${n}: agent produced no changes"
  "$GH" issue comment "$n" -b "⚠️ agent-inbox: the agent produced no changes — needs a human." >/dev/null 2>&1 || true
  "$GH" issue edit "$n" --add-label needs-human --remove-label wip >/dev/null 2>&1 || true
  exit 0
fi

# ── Provision local, git-IGNORED files the GATES need (same gap as node_modules):
# .env.local etc. (tsx --env-file scripts read them). Done AFTER the commit above so these
# symlinks are never committed into the PR; the gates run right after. Override the set
# with AGENT_LOCAL_PATHS. ─
shopt -s nullglob
LOCAL_GLOBS=( "$ROOT"/.env "$ROOT"/.env.local "$ROOT"/.env.staging.local "$ROOT"/.env.production.local )
for extra in ${AGENT_LOCAL_PATHS:-}; do LOCAL_GLOBS+=( "$ROOT/$extra" ); done
for src in "${LOCAL_GLOBS[@]}"; do
  [ -e "$src" ] || continue
  rel="${src#"$ROOT"/}"; dst="$wt/$rel"
  [ -e "$dst" ] || { mkdir -p "$(dirname "$dst")" && ln -s "$src" "$dst" 2>/dev/null; } || true
done
shopt -u nullglob

# ── Safety net: the project's own gates decide ship vs. hand-back ────────────────
log "running gates: ${GATES_CMD}"
if bash -c "$GATES_CMD" >"${LOGDIR}/gates-${n}.log" 2>&1; then
  # ── Push with bounded retry, capturing the REAL error ───────────────────────────
  # A single transient push/network blip used to strand the build: the old one-shot
  # `git push … 2>/dev/null` swallowed the error, `pr create` then had no branch and
  # emitted "(pr create failed)", yet the issue was still marked `done` — leaving a
  # built-but-unshipped branch and an opaque message (issue #901). Retry with backoff
  # and, if it ultimately fails, hand back to a human with the captured error instead
  # of faking success. (`done` is set ONLY after a PR truly opens.)
  pushed=0
  for ((attempt=1; attempt<=PUSH_RETRIES; attempt++)); do
    if git push -u "$REMOTE" "$branch" >"${LOGDIR}/push-${n}.log" 2>&1; then pushed=1; break; fi
    log "issue #${n}: push attempt ${attempt}/${PUSH_RETRIES} failed (see push-${n}.log)"
    [ "$attempt" -lt "$PUSH_RETRIES" ] && sleep "$((attempt * PUSH_RETRY_DELAY))"
  done
  if [ "$pushed" -ne 1 ]; then
    log "issue #${n}: push FAILED after ${PUSH_RETRIES} attempts — needs a human"
    "$GH" issue comment "$n" -b "$(printf '⚠️ agent-inbox: gates were green but `git push` failed after %s attempts — needs a human.\n\n```\n%s\n```' "$PUSH_RETRIES" "$(tail -25 "${LOGDIR}/push-${n}.log" 2>/dev/null)")" >/dev/null 2>&1 || true
    "$GH" issue edit "$n" --add-label needs-human --remove-label wip >/dev/null 2>&1 || true
    exit 0
  fi
  # ── Open the PR — capture stderr; even with the branch pushed, `pr create` can fail ─
  if ! url="$("$GH" pr create --fill --head "$branch" --base "$BASE" 2>"${LOGDIR}/prcreate-${n}.log")" || [ -z "$url" ]; then
    log "issue #${n}: pr create FAILED (branch is pushed) — needs a human"
    "$GH" issue comment "$n" -b "$(printf '⚠️ agent-inbox: branch `%s` pushed (gates green) but `gh pr create` failed — needs a human to open the PR.\n\n```\n%s\n```' "$branch" "$(tail -25 "${LOGDIR}/prcreate-${n}.log" 2>/dev/null)")" >/dev/null 2>&1 || true
    "$GH" issue edit "$n" --add-label needs-human --remove-label wip >/dev/null 2>&1 || true
    exit 0
  fi
  # docs/35: hand the fresh PR to the review↔fix loop via REST (gh pr edit --add-label hits the
  # projectCards GraphQL bug and silently drops the label). The PR number is the URL's last segment.
  add_label "${url##*/}" review-needed
  "$GH" issue comment "$n" -b "✅ agent-inbox: gates green. PR: ${url}" >/dev/null 2>&1 || true
  "$GH" issue edit "$n" --add-label done --remove-label wip >/dev/null 2>&1 || true
  log "issue #${n} DONE → ${url}"
else
  log "issue #${n}: gates FAILED — triaging"
  # ── SELF-HEAL: don't dead-end on needs-human. Classify the failure and route it:
  # transient → retry next tick; the agent's OWN fault → needs-human; infra/unrelated
  # breakage (not caused by this change) → auto-file a deduped blocker issue + mark this
  # one `blocked` so the loop keeps moving (it re-queues when the blocker closes). The
  # triage script is the single source of that policy; fall back to the old needs-human
  # path if it is missing/unexecutable so a broken triage never strands the run. ─
  TRIAGE="${AGENT_TRIAGE:-$ROOT/scripts/agent-triage-failure.sh}"
  if [ -x "$TRIAGE" ] && TRIAGE_GH="$GH" bash "$TRIAGE" \
        --issue "$n" --branch "$branch" --base "$BASE" --root "$ROOT" \
        --worktree "$wt" --log "${LOGDIR}/gates-${n}.log" >>"${LOGDIR}/triage-${n}.log" 2>&1; then
    log "issue #${n}: triage routed it (see triage-${n}.log)"
  else
    log "issue #${n}: triage unavailable/failed — falling back to needs-human"
    "$GH" issue comment "$n" -b "$(printf '❌ agent-inbox: gates failed:\n\n```\n%s\n```' "$(tail -25 "${LOGDIR}/gates-${n}.log")")" >/dev/null 2>&1 || true
    "$GH" issue edit "$n" --add-label needs-human --remove-label wip >/dev/null 2>&1 || true
  fi
fi
