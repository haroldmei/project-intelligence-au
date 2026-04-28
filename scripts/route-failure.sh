#!/usr/bin/env bash
# route-failure.sh — map a quality-gate or dogfood failure to the owning skill.
#
# Reads:
#   --gate <name>    the gate that failed (typecheck|lint|unit|mutation|...)
#   --area <path>    the file path or module that failed (optional; helps disambiguate)
#
# Emits:
#   <owner_skill>    the skill name the orchestrator should re-spawn
#
# This is a dumb router. Smart routing belongs in the orchestrator — this
# script is the lookup table the failure-routing matrix in
# build-product-v2 SKILL.md describes.

set -euo pipefail

GATE=""
AREA=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gate) GATE="$2"; shift 2;;
    --area) AREA="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

[[ -z "$GATE" ]] && { echo "ERROR: --gate required" >&2; exit 2; }

route() {
  case "$GATE" in
    typecheck|lint)
      # blame the area if known
      case "$AREA" in
        *src/app/*|*src/components/*|*src/pages/*) echo "frontend-developer";;
        *src/lib/*|*src/api/*|*src/server/*)        echo "backend-developer";;
        *prisma/*|*migrations/*)                    echo "db-migrator";;
        *)                                           echo "frontend-developer";; # default
      esac;;

    unit)
      case "$AREA" in
        *components*|*pages*|*frontend*) echo "frontend-developer";;
        *jobs*|*queues*)                  echo "background-jobs";;
        *db*|*prisma*|*migrations*)       echo "db-migrator";;
        *)                                 echo "backend-developer";;
      esac;;

    mutation)
      # Mutation failures mean tests are too weak — adversarial-tester adds stronger ones.
      echo "adversarial-tester";;

    integration)
      echo "backend-developer";;

    contract)
      # OpenAPI / API drift
      echo "backend-developer";;

    e2e)
      # Could be either; default to frontend, the orchestrator can override
      # using the dogfood-style bug owner field.
      echo "frontend-developer";;

    a11y)
      echo "ux-designer";;

    lighthouse)
      echo "perf-tester";;

    visual)
      echo "frontend-developer";;

    # Dogfood verdicts
    dogfood-cosmetic)  echo "frontend-developer";;
    dogfood-structural) echo "ux-designer";;
    dogfood-architecture) echo "designer";;

    # Security
    security-critical) echo "security-auditor";;
    security-secrets)  echo "env-manager";;

    # Deploy / canary
    canary-pipeline)   echo "cicd";;
    canary-infra)      echo "deployer";;
    canary-build)      echo "frontend-developer";;

    *)
      echo "ERROR: unknown gate '$GATE'" >&2
      exit 1;;
  esac
}

route
