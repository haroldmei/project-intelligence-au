#!/usr/bin/env bash
# state-set.sh — write a field into state/state.json
#
# Usage:
#   scripts/state-set.sh <jq_path> <json_value>
#
# Examples:
#   scripts/state-set.sh '.wedge_sentence' '"Two-click bookkeeping for Shopify DTC."'
#   scripts/state-set.sh '.scale_tier'     '"launch"'
#   scripts/state-set.sh '.phase_status.differentiation' '"done"'
#   scripts/state-set.sh '.kill_switches'  '["demand: <30 yes after 50 outreach"]'
#
# Atomic: writes to a temp file then renames. Safe under concurrent reads.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="$ROOT/state/state.json"

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <jq_path> <json_value>" >&2
  exit 2
fi

if [[ ! -f "$STATE_FILE" ]]; then
  echo "ERROR: $STATE_FILE not found. Run scripts/state-init.sh first." >&2
  exit 1
fi

JQ_PATH="$1"
JSON_VAL="$2"

TMP=$(mktemp)
jq --argjson v "$JSON_VAL" "$JQ_PATH = \$v" "$STATE_FILE" > "$TMP"
mv "$TMP" "$STATE_FILE"

echo "✓ set $JQ_PATH"
jq "$JQ_PATH" "$STATE_FILE"
