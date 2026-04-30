#!/usr/bin/env bash
# Source an env file (if it exists) then exec the rest of the command line.
# Used by package.json scripts to inject .env.<env>.local into commands
# that don't natively support --env-file (e.g. playwright).
#
# Usage: bash scripts/with-env.sh <env-file> <command> [args...]
#
# Examples:
#   bash scripts/with-env.sh .env.staging.local pnpm exec playwright test
#   bash scripts/with-env.sh .env.production.local node script.js
set -euo pipefail

ENV_FILE="${1:?env-file path required as first arg}"
shift

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "[with-env] $ENV_FILE not found; running without it" >&2
fi

exec "$@"
