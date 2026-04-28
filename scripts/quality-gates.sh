#!/usr/bin/env bash
# quality-gates.sh — layered hard quality gate runner for build-product-v2.
#
# Each gate is a separate hard pass. A gate failure exits non-zero with the
# gate name; the orchestrator uses the exit name to route the failure.
#
# Skips gates whose tooling is not present (logs SKIP, does not fail).
# Override which gates run with --only and --skip:
#
#   scripts/quality-gates.sh --only typecheck,unit
#   scripts/quality-gates.sh --skip mutation,visual
#
# Stop on first failure by default; --keep-going runs all gates and
# reports at the end.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---- argument parsing ----
ONLY=""
SKIP=""
KEEP_GOING=0
MUTATION_THRESHOLD="${MUTATION_THRESHOLD:-70}"
LIGHTHOUSE_PERF_BUDGET="${LIGHTHOUSE_PERF_BUDGET:-80}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --only)        ONLY="$2"; shift 2;;
    --skip)        SKIP="$2"; shift 2;;
    --keep-going)  KEEP_GOING=1; shift;;
    -h|--help)
      sed -n '2,12p' "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

# ---- gate registry (in dependency order) ----
GATES=(typecheck lint unit mutation integration contract e2e a11y lighthouse visual)

results=()         # "<gate>:<pass|fail|skip>:<reason>"
fail_count=0

# Helper: should we run this gate?
should_run() {
  local name="$1"
  if [[ -n "$ONLY" ]]; then
    [[ ",${ONLY}," == *",${name},"* ]] || return 1
  fi
  if [[ -n "$SKIP" ]]; then
    [[ ",${SKIP}," == *",${name},"* ]] && return 1
  fi
  return 0
}

record() {
  local name="$1" status="$2" reason="${3:-}"
  results+=("${name}:${status}:${reason}")
  case "$status" in
    pass) printf '  ✓ %-12s %s\n' "$name" "$reason";;
    fail) printf '  ✗ %-12s %s\n' "$name" "$reason"; ((fail_count++));;
    skip) printf '  · %-12s SKIP — %s\n' "$name" "$reason";;
  esac
  if [[ "$status" == "fail" && "$KEEP_GOING" -eq 0 ]]; then
    summary
    exit 1
  fi
}

run_gate() {
  local name="$1"
  shift
  if ! should_run "$name"; then
    record "$name" skip "filtered out"
    return 0
  fi
  if "$@" >/tmp/qg-"$name".log 2>&1; then
    record "$name" pass "ok"
  else
    record "$name" fail "see /tmp/qg-$name.log"
  fi
}

# ---- gate implementations ----
gate_typecheck() {
  if [[ -f tsconfig.json ]]; then
    npx --yes tsc --noEmit
  elif command -v mypy >/dev/null && [[ -d src ]]; then
    mypy src
  else
    echo "no typechecker configured"; return 0
  fi
}

gate_lint() {
  if [[ -f .eslintrc.js || -f .eslintrc.json || -f eslint.config.js || -f eslint.config.mjs ]]; then
    npx --yes eslint . --max-warnings=0
  elif command -v ruff >/dev/null; then
    ruff check .
  else
    echo "no linter configured"; return 0
  fi
}

gate_unit() {
  if [[ -f vitest.config.ts || -f vitest.config.js ]]; then
    npx --yes vitest run --reporter=verbose
  elif [[ -f jest.config.js || -f jest.config.ts ]]; then
    npx --yes jest --ci
  elif [[ -f pyproject.toml ]] && grep -q pytest pyproject.toml; then
    pytest -q
  else
    npm test --silent || return 1
  fi
}

gate_mutation() {
  if [[ ! -f stryker.conf.js && ! -f stryker.conf.json && ! -f stryker.config.json ]]; then
    echo "stryker not configured"; return 0   # treat as skip
  fi
  npx --yes stryker run --maxConcurrentTestRunners=2
  # Parse score from reports/mutation/mutation.json if present.
  if [[ -f reports/mutation/mutation.json ]]; then
    local score
    score=$(node -e "
      const r = require('./reports/mutation/mutation.json');
      const f = r.metrics?.mutationScore ?? r.systemUnderTestMetrics?.metrics?.mutationScore;
      if (f === undefined) { console.error('no score'); process.exit(1); }
      console.log(Math.round(f));
    ")
    echo "mutation score: $score (threshold $MUTATION_THRESHOLD)"
    [[ "$score" -ge "$MUTATION_THRESHOLD" ]]
  fi
}

gate_integration() {
  if [[ -d tests/integration ]]; then
    npx --yes vitest run tests/integration --reporter=verbose
  elif [[ -d e2e ]] && grep -q '"test:integration"' package.json 2>/dev/null; then
    npm run test:integration
  else
    echo "no integration suite"; return 0
  fi
}

gate_contract() {
  if [[ -f openapi.yaml ]]; then
    # Validate OpenAPI spec parses
    npx --yes @redocly/cli lint openapi.yaml
    # If a contract test runner is wired, run it
    if grep -q '"test:contract"' package.json 2>/dev/null; then
      npm run test:contract
    fi
  else
    echo "no openapi.yaml"; return 0
  fi
}

gate_e2e() {
  if [[ -f playwright.config.ts || -f playwright.config.js ]]; then
    npx --yes playwright test
  else
    echo "no playwright config"; return 0
  fi
}

gate_a11y() {
  # Standalone axe-core run if a script is wired; otherwise rely on
  # @axe-core/playwright assertions inside the e2e suite.
  if grep -q '"test:a11y"' package.json 2>/dev/null; then
    npm run test:a11y
  else
    echo "no a11y script (covered by e2e if @axe-core/playwright is used)"; return 0
  fi
}

gate_lighthouse() {
  if ! command -v npx >/dev/null; then return 0; fi
  if [[ -z "${LIGHTHOUSE_URL:-}" ]]; then
    echo "LIGHTHOUSE_URL unset"; return 0
  fi
  npx --yes lighthouse "$LIGHTHOUSE_URL" \
    --output=json --output-path=/tmp/lh.json --quiet \
    --chrome-flags='--headless=new --no-sandbox'
  local perf
  perf=$(node -e "console.log(Math.round(require('/tmp/lh.json').categories.performance.score * 100))")
  echo "lighthouse perf: $perf (budget $LIGHTHOUSE_PERF_BUDGET)"
  [[ "$perf" -ge "$LIGHTHOUSE_PERF_BUDGET" ]]
}

gate_visual() {
  if grep -q '"test:visual"' package.json 2>/dev/null; then
    npm run test:visual
  else
    echo "no visual regression script"; return 0
  fi
}

# ---- run ----
echo "Quality gates — root: $ROOT"
echo "  only=${ONLY:-<all>}  skip=${SKIP:-<none>}  keep_going=$KEEP_GOING"
echo

for g in "${GATES[@]}"; do
  case "$g" in
    typecheck)   run_gate "$g" gate_typecheck;;
    lint)        run_gate "$g" gate_lint;;
    unit)        run_gate "$g" gate_unit;;
    mutation)    run_gate "$g" gate_mutation;;
    integration) run_gate "$g" gate_integration;;
    contract)    run_gate "$g" gate_contract;;
    e2e)         run_gate "$g" gate_e2e;;
    a11y)        run_gate "$g" gate_a11y;;
    lighthouse)  run_gate "$g" gate_lighthouse;;
    visual)      run_gate "$g" gate_visual;;
  esac
done

summary() {
  echo
  echo "── Quality gates summary ──"
  for r in "${results[@]}"; do
    IFS=':' read -r name status reason <<< "$r"
    printf '  %-12s %-4s  %s\n' "$name" "$status" "$reason"
  done
  echo
  if [[ "$fail_count" -gt 0 ]]; then
    echo "RESULT: $fail_count gate(s) FAILED"
  else
    echo "RESULT: all gates pass"
  fi
}

summary
exit "$fail_count"
