#!/usr/bin/env bash
# agent-triage-failure.sh — turn a RED quality-gate into the right next action so the
# unattended loop SELF-HEALS instead of dead-ending on `needs-human`.
#
# The agent-inbox used to do exactly one thing when the gates failed: comment the log +
# label `needs-human`. That fails OPEN — it can't tell whose fault the failure is, and it
# never turns a blocker into work, so the SAME infra/test breakage recurs on every issue
# (the #89 shared-volume alembic brick; the #90 pre-existing e2e specs the agent never
# touched). This script classifies the failure and routes it:
#
#   transient  — rate-limit / docker daemon down / OOM / network  → RETRY next tick (file
#                nothing, drop `wip`); the limit clears on its own.
#   self       — the failing area INTERSECTS the agent's own changed files            → `needs-human`
#   infra      — alembic "Can't locate revision", "exited (255)", "dependency failed to
#                start", seed/migration/volume → AUTO-FILE a deduped `agent`+`harness`
#                blocker issue, mark the current issue `blocked` → loop continues.
#   unrelated  — a gate failed in files the agent did NOT touch (a pre-existing breakage
#                the now-running gate exposed) → AUTO-FILE a deduped `agent`+`flaky` issue
#                for THAT failure, mark the current issue `blocked` → loop continues.
#
# GUARDRAILS against an issue storm (the thing you must get right with any self-filing loop):
#   • stable FINGERPRINT per failure (tmp paths / line numbers / hex / timestamps stripped),
#     checked against OPEN issues — a dup just bumps a counter + comments, never re-files.
#   • OUTCOME LEDGER with a per-fingerprint attempt counter; after TRIAGE_MAX_ATTEMPTS
#     auto-file→still-red cycles, STOP self-filing and escalate a real `needs-human`.
#   • GLOBAL CAP (TRIAGE_MAX_OPEN) on open auto-filed blocker issues; beyond it, escalate.
#
# Injectable + hermetically testable (scripts/agent-triage-failure.test.sh): gh + git are
# overridable and every MUTATING gh call goes through `do_gh`, which `--dry-run` turns into a
# printed `WOULD:` line (zero GitHub side-effects) — so it can be dry-run against real issues.
#
#   Usage:
#     scripts/agent-triage-failure.sh --issue N --branch BR --base main \
#        --root /path/to/repo --log gates-N.log [--changed file] [--dry-run]
#
#   Prints a DECISION line and performs (or, with --dry-run, narrates) the routing.
#   Exit 0 always — this is an advisory router, never the thing that fails the run.
set -uo pipefail

# ── Injectable dependencies (defaults = production; tests/dry-run override) ───────
GH="${TRIAGE_GH:-gh}"
LABEL="${TRIAGE_LABEL:-agent}"            # inbox label new blocker issues get
HARNESS_LABEL="${TRIAGE_HARNESS_LABEL:-harness}"
FLAKY_LABEL="${TRIAGE_FLAKY_LABEL:-flaky}"
BLOCKED_LABEL="${TRIAGE_BLOCKED_LABEL:-blocked}"
MAX_ATTEMPTS="${TRIAGE_MAX_ATTEMPTS:-3}"  # per-fingerprint auto-file→still-red cycles before escalate
MAX_OPEN="${TRIAGE_MAX_OPEN:-5}"          # cap on open auto-filed blocker issues at once
MAX_SELF_REPAIR="${TRIAGE_MAX_SELF_REPAIR:-2}"   # `self` re-build attempts (with the gate log fed back) before needs-human
MAX_TRANSIENT="${TRIAGE_MAX_TRANSIENT:-8}"       # transient retries per fingerprint before escalating (a "transient" that never clears isn't transient)
# Marker the triage leaves on a self-repair comment; the inbox reads the latest one and feeds
# its gate log back into the next build. MUST match the string agent-inbox.sh greps for.
SELF_REPAIR_MARKER="${TRIAGE_SELF_REPAIR_MARKER:-<!-- self-repair -->}"

ISSUE="" BRANCH="" BASE="main" ROOT="" WORKTREE="" LOG="" CHANGED_FILE="" DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --issue)   ISSUE="$2"; shift 2;;
    --branch)  BRANCH="$2"; shift 2;;
    --base)    BASE="$2"; shift 2;;
    --root)    ROOT="$2"; shift 2;;
    --worktree)WORKTREE="$2"; shift 2;;
    --log)     LOG="$2"; shift 2;;
    --changed) CHANGED_FILE="$2"; shift 2;;     # newline-delimited file list (else computed)
    --dry-run) DRY_RUN=1; shift;;
    *) echo "[triage] unknown arg: $1" >&2; exit 2;;
  esac
done
ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
[ -n "$ISSUE" ] || { echo "[triage] --issue required" >&2; exit 2; }
[ -n "$LOG" ] && [ -f "$LOG" ] || { echo "[triage] --log <existing file> required" >&2; exit 2; }

log() { printf '[triage] %s\n' "$*"; }

# Per-repo state dir (ledger) — namespaced by repo so unrelated repos never share a counter.
ns() { git -C "$ROOT" rev-parse --git-common-dir 2>/dev/null | { read -r d; cd "$ROOT" 2>/dev/null && cd "$d" 2>/dev/null && pwd; } | sha1sum | cut -c1-12; }
NS="$(ns 2>/dev/null || true)"; [ -n "$NS" ] || NS="nogit"
STATE_DIR="${TRIAGE_STATE_DIR:-/tmp/agent-triage-$NS}"
LEDGER="${TRIAGE_LEDGER:-$STATE_DIR/ledger.jsonl}"
mkdir -p "$STATE_DIR" 2>/dev/null || true

# Every MUTATING gh call funnels through here so --dry-run is provably side-effect-free.
do_gh() {
  if [ "$DRY_RUN" = 1 ]; then printf 'WOULD: gh %s\n' "$*"; return 0; fi
  "$GH" "$@" >/dev/null 2>&1 || log "WARN: gh $* failed"
}
# Label via REST (gh's --add-label hits the deprecated projectCards GraphQL field and
# flakily drops the label — docs/35). Read-only gh (list/view) runs even under --dry-run.
add_label()    { do_gh api -X POST "repos/{owner}/{repo}/issues/$1/labels" -f "labels[]=$2"; }
remove_label() { do_gh api -X DELETE "repos/{owner}/{repo}/issues/$1/labels/$2"; }
# `gh issue create --label X` VALIDATES X and fails outright if the label doesn't exist yet
# (harness/flaky are new). Pre-create them idempotently so the first auto-file never no-ops.
ensure_label() { do_gh label create "$1" --force; }

# ── Collect the full failure text: the captured gate log PLUS any sub-logs it points
# at (quality-gates prints "see /tmp/qg-XXX/e2e.log" — the real Playwright/compose detail
# lives THERE, not in the summary). Following the reference is what lets us fingerprint the
# specific failing spec or the alembic error rather than the generic "1 gate failed". ─
collect_text() {
  cat "$LOG" 2>/dev/null
  # de-dup referenced paths, read those that still exist on disk
  grep -oE 'see /[A-Za-z0-9._/-]+\.log' "$LOG" 2>/dev/null | awk '{print $2}' | sort -u | while read -r p; do
    [ -f "$p" ] && { echo "── referenced: $p ──"; cat "$p" 2>/dev/null; }
  done
}
TEXT="$(collect_text)"

# ── The failing gate name (from the quality-gates summary: "✗ e2e …" / "e2e   fail …") ─
failing_gate() {
  printf '%s\n' "$TEXT" \
    | grep -E '(^|[[:space:]])(✗|✘)[[:space:]]+[a-z]|[[:space:]]fail[[:space:]]' \
    | grep -oE '\b(typecheck|lint|seed-integrity|unit|repro-tests|mutation|integration|contract|e2e|wedge-coverage|journey-coverage|a11y|lighthouse|visual)\b' \
    | head -1
}
GATE="$(failing_gate)"; [ -n "$GATE" ] || GATE="gate"

# ── Failing AREA: the files that actually FAILED (basenames, so a worktree tmp path matches
# a repo-relative changed path). This drives the self-vs-unrelated split, so it must pick out
# only failures — NOT every test that ran. Playwright's `--reporter=line` prints a line per
# test, so a naive scan grabs all specs; we key on failure-only markers instead:
#   • numbered failure detail headers   "  1) [chromium] › foo.spec.ts:20:7 › …"
#   • stack frames                       "  at …/foo.spec.ts:70:73"
#   • pytest                             "FAILED tests/…py::…"  and  "…py:NN: …Error"
# Only if NONE of those match do we fall back to a broad token scan (best-effort). ─
failing_areas() {
  local hits
  hits="$( {
    printf '%s\n' "$TEXT" | grep -oE '^[[:space:]]*[0-9]+\)[[:space:]].*\.(spec|test)\.tsx?'
    printf '%s\n' "$TEXT" | grep -oE '\bat[[:space:]]+[A-Za-z0-9_./-]+\.(spec|test)\.tsx?:[0-9]+'
    printf '%s\n' "$TEXT" | grep -oE 'FAILED[[:space:]]+[A-Za-z0-9_./-]+\.py'
    printf '%s\n' "$TEXT" | grep -E '[A-Za-z0-9_./-]+\.py:[0-9]+:' | grep -iE 'error|assert' | grep -oE '[A-Za-z0-9_./-]+\.py:[0-9]+'
  } | grep -oE '[A-Za-z0-9_./-]+\.(spec\.tsx?|test\.tsx?|py)' | sed -E 's#^.*/##' | sort -u \
      | grep -vE '^(env|conftest|fixtures|setup)\.' )"
  if [ -n "$hits" ]; then printf '%s\n' "$hits"; return; fi
  # fallback: no structured failure markers — scan broadly (best-effort)
  printf '%s\n' "$TEXT" | grep -oE '[A-Za-z0-9_./-]+\.(spec\.ts|test\.tsx?|py)' \
    | sed -E 's#^.*/##' | sort -u | grep -vE '^(env|conftest|fixtures|setup)\.' || true
}

# ── The agent's own changed files (basenames) ─────────────────────────────────────
changed_basenames() {
  if [ -n "$CHANGED_FILE" ] && [ -f "$CHANGED_FILE" ]; then
    sed -E 's#^.*/##' "$CHANGED_FILE" | sort -u
  elif [ -n "$BRANCH" ]; then
    git -C "$ROOT" diff --name-only "${BASE}...${BRANCH}" 2>/dev/null | sed -E 's#^.*/##' | sort -u
  fi
}

# ── Classification ───────────────────────────────────────────────────────────────
is_transient() {
  printf '%s\n' "$TEXT" | grep -qiE \
    'session limit|usage limit|rate.?limit|overloaded|too many requests|quota|api_error_status.*(429|503|529)|cannot connect to the docker daemon|is the docker daemon running|docker daemon unreachable|no space left on device|temporary failure in name resolution|could not resolve|network is unreachable|i/o timeout|tls handshake timeout|connection reset by peer|oomkilled|error pulling image|manifest unknown|toomanyrequests'
}
is_infra() {
  # STRONG failure phrases only — never bare "alembic"/"migration"/"seed", since a SUCCESSFUL
  # stack boot logs "alembic.runtime.migration … Running upgrade" and would false-positive
  # every e2e run. We only want signals that the stack/DB itself failed to come up.
  printf '%s\n' "$TEXT" | grep -qiE \
    "can't locate revision|cant locate revision|multiple head revisions|ERROR \[alembic|FAILED: Can't locate|dependency failed to start|exited \(255\)|api/frontend failed to start|failed to start the e2e stack|could not translate host name|password authentication failed|relation \"[^\"]*\" does not exist|sqlalchemy\.exc\.|connection refused"
}

# ── Branch-introduced migration / boot failure (#172) ─────────────────────────────
# An `alembic upgrade head` that dies on the agent's OWN migration (a redundant
# create_unique_constraint → DuplicateTable, UndefinedColumn, multiple heads, a bad
# down_revision) crashes the api container — so compose prints the SAME
# "dependency failed to start" tail as a genuinely-infra poisoned-Postgres volume.
# Identical fingerprint, opposite owner. Splitting them is the whole point of this ticket:
# a migrate marker re-fingerprints the failure as `e2e:migrate-failure`; if the failing
# migration/model is in the agent's diff it's a `self` fault (feed the alembic error back into
# the next build), else it stays infra. (#152: migration 042 re-created a constraint 001
# already made; the volume was a red herring.)
#
# Markers are STRONG, migration-specific error signatures only — NOT bare "alembic" (a healthy
# boot logs "Running upgrade …") and NOT "can't locate revision" (kept on the infra path above,
# so a clean-checkout shared-state brick like #89 still routes to infra, not self).
is_migrate_failure() {
  printf '%s\n' "$TEXT" | grep -qiE \
    'migrate: non-transient failure|DuplicateTable|DuplicateObject|DuplicateColumn|UndefinedColumn|UndefinedTable|Multiple head revisions'
}
# Full repo-relative changed paths (NOT basenames — we must see the alembic/versions/ dir
# to tell an agent-authored migration from an unrelated model edit).
changed_paths() {
  if [ -n "$CHANGED_FILE" ] && [ -f "$CHANGED_FILE" ]; then
    sort -u "$CHANGED_FILE"
  elif [ -n "$BRANCH" ]; then
    git -C "$ROOT" diff --name-only "${BASE}...${BRANCH}" 2>/dev/null | sort -u
  fi
}
# The migration/model files in the agent's diff that could have broken the boot — the cheap
# self-intersection test the ticket asks for. Non-empty ⇒ this migrate crash is the agent's.
migrate_overlap() {
  changed_paths | grep -E 'alembic/versions/.*\.py$|(^|/)models/.*\.py$|(^|/)models\.py$' || true
}
# The real cause, pulled from the captured log so the comment shows the alembic/SQL error
# (which migration, what it collides with) instead of the generic compose container-exit tail.
migrate_excerpt() {
  printf '%s\n' "$TEXT" \
    | grep -iE 'Running upgrade|migrate: non-transient failure|DuplicateTable|DuplicateObject|DuplicateColumn|UndefinedColumn|UndefinedTable|Multiple head revisions|already exists|does not exist|asyncpg\.|sqlalchemy\.exc' \
    | tail -12
}
# Code-fenced excerpt for comments/blocker bodies. When we have a migrate error, lead with it
# (the actual cause) and keep only a short compose tail; otherwise use the caller's tail as-is.
fenced_excerpt() { # <fallback-text>
  if [ -n "${MIGRATE_EXCERPT:-}" ]; then
    printf 'migrate failure — the real cause (NOT the compose teardown tail below):\n%s\n\n--- compose tail ---\n%s' \
      "$MIGRATE_EXCERPT" "$(printf '%s\n' "$TEXT" | tail -12)"
  else
    printf '%s' "$1"
  fi
}

# ── Stable fingerprint: a kebab signature that the SAME failure always hashes to, so we
# never re-file a dup. We ANCHOR it on the failing TEST IDENTITY (pytest nodeid / Playwright
# spec+title / vitest spec+title) so two genuinely different failing tests can NEVER collapse
# into one bucket (#937). The old fingerprint slugified an arbitrary "salient" line, so any
# failure whose first salient line happened to mention `config.py` — a traceback frame, a
# pydantic error — all became `unit:config-py`: that corrupted the per-fingerprint attempt
# counter (unrelated failures burned each other's retries → premature `needs-human`) and
# pointed the escalation at the wrong file. Only when NO test id is extractable do we fall back
# to the lossy slug(salient_line), tagged `…-unclassified` so it's obviously low-confidence.
# (Infra/migrate keep their dedicated signatures — see below.) ─
salient_line() {
  if is_infra; then
    printf '%s\n' "$TEXT" | grep -ioE "can't locate revision identified by '[^']*'|multiple head revisions|dependency failed to start|exited \(255\)|password authentication failed|relation \"[^\"]*\" does not exist" | head -1
  else
    # the first failing spec/test name, else the first "Error:"/"FAILED" line
    local a; a="$(failing_areas | head -1)"
    if [ -n "$a" ]; then echo "$a"; else
      printf '%s\n' "$TEXT" | grep -iE 'error:|assert|FAILED|Timed out' | head -1
    fi
  fi
}
slug() { sed -E "s#/[A-Za-z0-9._/-]+##g; s/[0-9a-f]{7,}//g; s/[0-9]+//g; s/[^A-Za-z]+/-/g; s/^-+|-+\$//g" | tr 'A-Z' 'a-z' | cut -c1-60; }

# Gentle normalizer for a test id: keep [a-z0-9_], collapse other runs to a single '_', trim,
# cap length. Unlike slug() it does NOT strip digits (so test_foo_v2 ≠ test_foo) and it preserves
# the existing `__` separator between the file basename and the test name.
norm_testid() { sed -E 's/[^A-Za-z0-9_]+/_/g; s/^_+|_+$//g' | tr 'A-Z' 'a-z' | cut -c1-80; }

# pytest: "FAILED path/test_x.py::TestC::test_y[p] - AssertionError" / "ERROR path/test_x.py".
# Anchor on the nodeid: basename(-.py) + the ::-joined test path → test_x__TestC__test_y_p.
pytest_sig() {
  printf '%s\n' "$TEXT" \
    | grep -oE '^[[:space:]]*(FAILED|ERROR)[[:space:]]+[A-Za-z0-9_./-]+\.py(::[^[:space:]]+)?' \
    | head -1 \
    | sed -E 's/^[[:space:]]*(FAILED|ERROR)[[:space:]]+//; s#^.*/##; s/\.py::/__/; s/\.py$//; s/::/__/g' \
    | norm_testid
}
# Playwright: "  1) [chromium] › foo.spec.ts:16:7 › Suite › Test title" → spec basename + title.
playwright_sig() {
  local line spec title
  line="$(printf '%s\n' "$TEXT" | grep -oiE '^[[:space:]]*[0-9]+\)[[:space:]].*\.(spec|test)\.tsx?:[0-9]+:[0-9]+.*' | head -1)"
  [ -n "$line" ] || return 0
  spec="$(printf '%s' "$line" | grep -oE '[A-Za-z0-9_./-]+\.(spec|test)\.tsx?' | head -1 | sed -E 's#^.*/##; s/\.(spec|test)\.tsx?$//')"
  title="$(printf '%s' "$line" | sed -E 's/.*\.(spec|test)\.tsx?:[0-9]+:[0-9]+[^A-Za-z0-9]*//')"
  printf '%s__%s' "$spec" "$title" | norm_testid
}
# vitest: "FAIL  src/x.test.tsx > Suite > Test title" (separator ' > ', no :line:col) → spec+title.
vitest_sig() {
  local line spec rest
  line="$(printf '%s\n' "$TEXT" | grep -E '\.(test|spec)\.tsx?[[:space:]]+>[[:space:]]+' | grep -iE 'fail|×|✗|✘|❯' | head -1)"
  [ -n "$line" ] || return 0
  spec="$(printf '%s' "$line" | grep -oE '[A-Za-z0-9_./-]+\.(test|spec)\.tsx?' | head -1 | sed -E 's#^.*/##; s/\.(test|spec)\.tsx?$//')"
  rest="$(printf '%s' "$line" | sed -E 's/^.*\.(test|spec)\.tsx?[[:space:]]+>[[:space:]]+//')"
  printf '%s__%s' "$spec" "$rest" | norm_testid
}
# First test-anchored signature we can extract (pytest → Playwright → vitest), else empty.
test_signature() {
  local s
  s="$(pytest_sig)";     [ -n "$s" ] && { printf '%s' "$s"; return 0; }
  s="$(playwright_sig)"; [ -n "$s" ] && { printf '%s' "$s"; return 0; }
  s="$(vitest_sig)";     [ -n "$s" ] && { printf '%s' "$s"; return 0; }
  return 0
}

if is_infra; then
  SIG="$(salient_line | slug)"; [ -n "$SIG" ] || SIG="unclassified"
else
  SIG="$(test_signature)"
  if [ -z "$SIG" ]; then
    # No failing test id — keep the legacy lossy slug but TAG it so the low-confidence bucket is
    # unmistakable (humans/agents know not to trust this fingerprint as "the failing test").
    SIG="$(salient_line | slug)"
    if [ -n "$SIG" ]; then SIG="${SIG}-unclassified"; else SIG="unclassified"; fi
  fi
fi
# A migrate/boot failure gets a dedicated sub-fingerprint so it never collides with the
# genuinely-infra `dependency-failed-to-start` signature (#172). alembic only runs inside the
# e2e stack boot, so pin the gate to `e2e` → fingerprint `e2e:migrate-failure`.
MIGRATE_EXCERPT=""
if is_migrate_failure; then GATE="e2e"; SIG="migrate-failure"; MIGRATE_EXCERPT="$(migrate_excerpt)"; fi
FP="${GATE}:${SIG}"
FP_MARKER="<!-- triage-fp:${FP} -->"

# ── Ledger helpers (attempt counter per fingerprint, persisted across ticks) ──────
ledger_attempts() { # grep -c prints "0" AND exits 1 on zero matches, so a naive `|| echo 0`
                    # yields "0\n0" → integer-comparison error. Capture + swallow exit instead.
  local c; c="$(grep -cF "\"fp\":\"${FP}\"" "$LEDGER" 2>/dev/null || true)"; echo "${c:-0}"; }
ledger_transient_attempts() { # prior transient retries recorded for THIS fingerprint
  local c; c="$(grep -F "\"fp\":\"${FP}\"" "$LEDGER" 2>/dev/null | grep -cF '"action":"transient"' || true)"; echo "${c:-0}"; }
ledger_record() { # <action> <blocker#>
  [ "$DRY_RUN" = 1 ] && { printf 'WOULD: ledger += {fp:%s action:%s blocker:%s}\n' "$FP" "$1" "${2:-}"; return; }
  printf '{"fp":"%s","issue":"%s","action":"%s","blocker":"%s"}\n' "$FP" "$ISSUE" "$1" "${2:-}" >> "$LEDGER" 2>/dev/null || true
}

# ── Dedup: an OPEN issue already carrying this fingerprint marker (open blockers only) ─
existing_blocker() {
  # NEVER return the issue being triaged — an issue cannot block itself (the marker lives in
  # the blocker's OWN body, so a same-fingerprint search would otherwise match it).
  "$GH" issue list --label "$LABEL" --state open --search "$FP_MARKER in:body" \
    --json number,body --limit 20 2>/dev/null \
    | jq -r --arg m "$FP_MARKER" --argjson self "${ISSUE:-0}" \
        '[.[] | select((.number != $self) and (.body | contains($m)))][0].number // empty' 2>/dev/null
}
open_autofiled_count() { # harness + flaky blockers currently open (single clean integer)
  local c
  c="$( { "$GH" issue list --label "$HARNESS_LABEL" --state open --json number --limit 100 2>/dev/null || echo '[]'
          "$GH" issue list --label "$FLAKY_LABEL"   --state open --json number --limit 100 2>/dev/null || echo '[]'
        } | jq -s 'add | length' 2>/dev/null )"
  echo "${c:-0}"
}

comment() { do_gh issue comment "$1" -b "$2"; }

escalate_needs_human() { # <reason>
  log "DECISION: needs-human — $1"
  printf 'DECISION: class=%s action=needs-human fp=%s reason=%s\n' "${CLASS:-self}" "$FP" "$1"
  comment "$ISSUE" "$(printf '❌ agent-inbox: gates failed (%s) — needs a human.\n\n%s\n\n```\n%s\n```' "$1" "$FP_MARKER" "$(fenced_excerpt "$(printf '%s\n' "$TEXT" | tail -25)")")"
  add_label "$ISSUE" "needs-human"
  remove_label "$ISSUE" "wip"
}

# How many self-repair attempts this issue has already had (= count of marker comments).
self_repair_attempts() {
  local n
  n="$("$GH" issue view "$ISSUE" --json comments \
        --jq "[.comments[] | select(.body | contains(\"$SELF_REPAIR_MARKER\"))] | length" 2>/dev/null)"
  echo "${n:-0}"
}

# The agent's OWN build failed (not infra, not someone else's code). Instead of dead-ending at
# needs-human, RE-QUEUE the issue with the gate-failure log attached so the next build can fix
# the ROOT CAUSE (often a pre-existing bug a correct new test exposed). Bounded: after
# MAX_SELF_REPAIR attempts, give up loudly to a human.
self_repair_or_escalate() { # <reason>
  local n; n="$(self_repair_attempts)"
  if [ "${n:-0}" -ge "$MAX_SELF_REPAIR" ]; then
    escalate_needs_human "$1 — self-repair exhausted after ${n} attempt(s)"; return
  fi
  local next=$((n + 1))
  log "DECISION: self action=self-repair attempt ${next}/${MAX_SELF_REPAIR} — $1"
  printf 'DECISION: class=self action=self-repair attempt=%s/%s fp=%s\n' "$next" "$MAX_SELF_REPAIR" "$FP"
  comment "$ISSUE" "$(printf '🔧 agent-inbox: the gate failed on this build (%s). Re-queuing for an automatic fix attempt (%s/%s) — the next build receives this failure log and must fix the ROOT CAUSE. The failing test may be CORRECT and exposing a pre-existing bug in code you did not write; fix that, not just your diff.\n\n```\n%s\n```\n%s' \
    "$1" "$next" "$MAX_SELF_REPAIR" "$(fenced_excerpt "$(printf '%s\n' "$TEXT" | tail -60)")" "$SELF_REPAIR_MARKER")"
  # Re-queue: keep `agent`, drop `wip`, do NOT add needs-human/blocked → eligible again next tick.
  remove_label "$ISSUE" "wip"
}

file_and_requeue() { # <kind: harness|flaky>  <extra-label>
  local kind="$1" extra="$2" attempts
  # Guardrail 0 (terminal): if THIS issue is itself the auto-filed fix for this exact
  # fingerprint — its own body carries the marker — and it's failing AGAIN on that
  # fingerprint, the designated fix didn't take. A human must step in. This is what stops
  # a blocker issue from blocking ITSELF (deadlock) or spawning a chain of blockers.
  if "$GH" issue view "$ISSUE" --json body --jq '.body' 2>/dev/null | grep -qF "$FP_MARKER"; then
    escalate_needs_human "this issue is the designated fix for ${FP} and it still fails"; return
  fi
  attempts="$(ledger_attempts)"
  # Guardrail 1: per-fingerprint attempt cap → stop self-filing, escalate for real.
  if [ "$attempts" -ge "$MAX_ATTEMPTS" ]; then
    escalate_needs_human "auto-fix attempted ${attempts}× without clearing (fp ${FP})"; return
  fi
  # Guardrail 2: global cap on open auto-filed blockers.
  local openc; openc="$(open_autofiled_count)"
  if [ "${openc:-0}" -ge "$MAX_OPEN" ]; then
    escalate_needs_human "auto-filed blocker cap reached (${openc} open ≥ ${MAX_OPEN})"; return
  fi
  # Dedup: a blocker for this fingerprint already exists → just attach to it.
  local blocker; blocker="$(existing_blocker 2>/dev/null || true)"
  if [ -n "$blocker" ]; then
    log "DECISION: ${CLASS} action=attach-to-existing blocker=#${blocker} fp=${FP}"
    printf 'DECISION: class=%s action=attach blocker=#%s fp=%s\n' "$CLASS" "$blocker" "$FP"
    comment "$blocker" "🔁 agent-inbox: still failing — also blocks #${ISSUE} (attempt $((attempts+1)))."
    comment "$ISSUE" "⛔ agent-inbox: blocked by #${blocker} (${CLASS} gate failure — not caused by this change). Re-queues automatically when #${blocker} closes. ${FP_MARKER}"
    add_label "$ISSUE" "$BLOCKED_LABEL"
    remove_label "$ISSUE" "wip"
    ledger_record "attach" "$blocker"
    return
  fi
  # File a fresh blocker issue into the inbox (label `agent` so the next tick builds it).
  local title body excerpt
  excerpt="$(fenced_excerpt "$(printf '%s\n' "$TEXT" | tail -40)")"
  if [ "$kind" = harness ]; then
    title="agent-inbox: ${GATE} gate blocked by harness/infra failure — ${SIG}"
    body="$(cat <<EOF
**Auto-filed by agent-triage-failure** while building #${ISSUE} (\`${BRANCH}\`).

The \`${GATE}\` quality gate failed for an **infrastructure / harness** reason — NOT a defect in
#${ISSUE}'s change. The agent's diff does not touch the failing area, so the right fix is to the
harness/shared state, after which #${ISSUE} (and every other branch) unblocks.

**Signature:** \`${FP}\`

**Acceptance:** the \`${GATE}\` gate runs to completion and passes on a clean checkout of \`${BASE}\`.

\`\`\`
${excerpt}
\`\`\`

Blocks: #${ISSUE}
${FP_MARKER}
EOF
)"
  else
    title="Failing ${GATE} exposed by the gate: ${SIG} (auto-filed)"
    body="$(cat <<EOF
**Auto-filed by agent-triage-failure** while building #${ISSUE} (\`${BRANCH}\`).

The \`${GATE}\` gate failed in **files this change never touched** — a pre-existing breakage the
now-running gate surfaced. It must be fixed on its own; #${ISSUE} is merely blocked behind it.

**Signature:** \`${FP}\`
**Failing area:** $(failing_areas | paste -sd', ' -)

**Acceptance:** the listed test(s) pass against \`${BASE}\`; the \`${GATE}\` gate goes green.

\`\`\`
${excerpt}
\`\`\`

Blocks: #${ISSUE}
${FP_MARKER}
EOF
)"
  fi

  if [ "$DRY_RUN" = 1 ]; then
    printf 'DECISION: class=%s action=file-and-requeue kind=%s fp=%s\n' "$CLASS" "$kind" "$FP"
    printf 'WOULD: gh issue create --label %s --label %s --title %q\n' "$LABEL" "$extra" "$title"
    printf '       body: %s … (%d chars) + marker %s\n' "$(printf '%s' "$body" | head -1)" "${#body}" "$FP_MARKER"
    printf 'WOULD: gh api issues/%s/labels labels[]=%s   (block current, drop wip)\n' "$ISSUE" "$BLOCKED_LABEL"
    ledger_record "file-dry" ""
    return
  fi
  ensure_label "$extra"; ensure_label "$BLOCKED_LABEL"   # so `issue create --label` can't no-op
  local url newnum
  url="$("$GH" issue create --label "$LABEL" --label "$extra" --title "$title" --body "$body" 2>/dev/null || echo '')"
  newnum="${url##*/}"
  # Never mark the issue `blocked` against a phantom blocker — if create failed, escalate.
  if ! printf '%s' "$newnum" | grep -qE '^[0-9]+$'; then
    escalate_needs_human "could not file the auto-blocker issue (gh issue create failed)"; return
  fi
  log "DECISION: ${CLASS} action=file-and-requeue blocker=#${newnum} fp=${FP}"
  printf 'DECISION: class=%s action=file-and-requeue blocker=#%s fp=%s\n' "$CLASS" "$newnum" "$FP"
  comment "$ISSUE" "⛔ agent-inbox: blocked by #${newnum} (${CLASS} ${GATE} failure — not caused by this change). Re-queues automatically when it closes. ${FP_MARKER}"
  add_label "$ISSUE" "$BLOCKED_LABEL"
  remove_label "$ISSUE" "wip"
  ledger_record "file" "$newnum"
}

# ── Decide ───────────────────────────────────────────────────────────────────────
log "fingerprint=${FP}  gate=${GATE}  dry-run=${DRY_RUN}"
if is_transient; then
  CLASS=transient
  tcount="$(ledger_transient_attempts)"; [[ "$tcount" =~ ^[0-9]+$ ]] || tcount=0
  if [ "$tcount" -ge "$MAX_TRANSIENT" ]; then
    # A "transient" failure that recurs every tick without ever clearing is NOT actually transient
    # (a chronic OOM, a permanently-down docker daemon, or asserted test output that merely contains
    # a transient-looking phrase). The old branch retried FOREVER with no cap — unbounded spend and
    # a stuck issue. After MAX_TRANSIENT retries, escalate to a human.
    escalate_needs_human "gate kept hitting a transient/availability error ${tcount}× without clearing (fp ${FP}) — not self-healing"
  else
    log "DECISION: transient — retry next tick (no file, drop wip) [retry $((tcount+1))/${MAX_TRANSIENT}]"
    printf 'DECISION: class=transient action=retry attempt=%s/%s fp=%s\n' "$((tcount+1))" "$MAX_TRANSIENT" "$FP"
    comment "$ISSUE" "⏳ agent-inbox: gates hit a transient/infra-availability error (\`${SIG}\`); will retry on the next tick. (transient retry $((tcount+1))/${MAX_TRANSIENT})"
    remove_label "$ISSUE" "wip"
    ledger_record "transient" ""
  fi
elif is_migrate_failure; then
  # The stack boot died on an alembic/migration error. Discriminate the agent's own broken
  # migration (→ self, fix it) from a genuinely-infra brick that merely surfaced during migrate
  # (→ infra, block+retry). The migrate error is fed back via the self-repair / blocker comment.
  mo="$(migrate_overlap)"
  if [ -n "$mo" ]; then
    CLASS=self
    self_repair_or_escalate "alembic upgrade head failed on a migration in this diff ($(printf '%s' "$mo" | paste -sd', ')) — it likely duplicates/conflicts with an existing migration; fix the migration, not the harness"
  else
    CLASS=infra
    file_and_requeue harness "$HARNESS_LABEL"
  fi
elif is_infra; then
  CLASS=infra
  file_and_requeue harness "$HARNESS_LABEL"
else
  fa="$(failing_areas)"; cb="$(changed_basenames)"
  overlap=""
  if [ -n "$fa" ] && [ -n "$cb" ]; then
    overlap="$(comm -12 <(printf '%s\n' "$fa") <(printf '%s\n' "$cb") 2>/dev/null)"
  fi
  if [ -n "$overlap" ]; then
    CLASS=self
    self_repair_or_escalate "failure is in the agent's own changed files ($(printf '%s' "$overlap" | paste -sd', '))"
  elif [ -n "$fa" ]; then
    CLASS=unrelated
    file_and_requeue flaky "$FLAKY_LABEL"
  else
    CLASS=self
    self_repair_or_escalate "could not localize the failure to specific files (conservative)"
  fi
fi
exit 0
