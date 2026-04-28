#!/usr/bin/env bash
# state-init.sh — initialize the build-product-v2 blackboard.
#
# Usage:
#   scripts/state-init.sh "<product idea>"
#
# Idempotent: existing state.json is preserved; missing fields are added
# with null defaults so older runs upgrade cleanly.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT/state"
STATE_FILE="$STATE_DIR/state.json"
DECISIONS_FILE="$STATE_DIR/decisions.md"
SIGNALS_FILE="$STATE_DIR/signals.json"

mkdir -p "$STATE_DIR"

PRODUCT_IDEA="${1:-${PRODUCT_IDEA:-}}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required. Install with: sudo apt install jq  (or: brew install jq)" >&2
  exit 1
fi

# Build the canonical default state.
DEFAULT_STATE=$(jq -n \
  --arg now "$NOW" \
  --arg idea "$PRODUCT_IDEA" \
  '{
    schema_version: 1,
    started_at: $now,
    product_idea: $idea,
    wedge_sentence: null,
    icp: null,
    axis: null,
    anti_axis: null,
    scale_tier: "preview",
    current_phase: "ceo",
    phase_status: {},
    critic_verdicts: {},
    kill_switches: [],
    decisions: [],
    open_issues: [],
    kpi_targets: {},
    signal_sources: {
      posthog:  { enabled: false, last_pull: null },
      sentry:   { enabled: false, last_pull: null },
      support:  { enabled: false, last_pull: null }
    }
  }')

if [[ -f "$STATE_FILE" ]]; then
  # Merge: existing state wins on overlapping keys, defaults fill missing.
  TMP=$(mktemp)
  jq -s '.[0] * .[1]' <(echo "$DEFAULT_STATE") "$STATE_FILE" > "$TMP"
  mv "$TMP" "$STATE_FILE"
  echo "✓ state.json upgraded in place (missing fields added)"
else
  echo "$DEFAULT_STATE" > "$STATE_FILE"
  echo "✓ state.json initialized"
fi

# Decisions log: human-readable ADR stream.
if [[ ! -f "$DECISIONS_FILE" ]]; then
  cat > "$DECISIONS_FILE" <<EOF
# Decisions Log

> One-line ADRs. Format: \`- [YYYY-MM-DD] <phase>: <decision> — because <reason>\`

EOF
  echo "✓ decisions.md initialized"
fi

# Signals snapshot (separate file so signal-iterate can update freely).
if [[ ! -f "$SIGNALS_FILE" ]]; then
  jq -n --arg now "$NOW" '{
    initialized_at: $now,
    last_full_pull: null,
    behavior:  { funnel_conversion: null, activation_24h: null, retention_d7: null },
    failure:   { top_issues: [], crash_free_rate: null },
    voice:     { themes: [] }
  }' > "$SIGNALS_FILE"
  echo "✓ signals.json initialized"
fi

echo
echo "State at: $STATE_FILE"
jq '{schema_version, current_phase, scale_tier, wedge_sentence}' "$STATE_FILE"
