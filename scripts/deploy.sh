#!/usr/bin/env bash
# PI-AU deploy automation. Two-environment model (Hobby plan):
#   - staging:    develop branch  → staging.pi-au.com  → Stripe TEST
#   - production: main branch     → www.pi-au.com      → Stripe LIVE
#
# Each environment has its own Vercel project, env file, and (eventually)
# Postgres database. The script never deploys "production" without a
# confirmation prompt.
#
# What this scripts: env validation, bulk env-var upload, deploy, smoke tests.
# What it cannot script (must be done in dashboards once): Resend domain DNS,
# Stripe live-key fetch, Vercel Postgres provisioning, PostHog/Sentry account
# bootstrap. Those are listed in docs/19-deploy-runbook.md.
#
# Usage:
#   scripts/deploy.sh <env> <subcommand>
#
#   <env>:        staging | production
#   <subcommand>: preflight | init-env | link | env-up | deploy | smoke | all | help
#
# Examples:
#   scripts/deploy.sh staging preflight
#   scripts/deploy.sh staging deploy
#   scripts/deploy.sh production deploy   # prompts for confirmation
#   scripts/deploy.sh staging all         # preflight → link → env-up → deploy

set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ─── Colours ──────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; CYAN=''; BOLD=''; NC=''
fi
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*" >&2; }
info()  { echo -e "${CYAN}→${NC} $*"; }

# Preflight validation lists. These document expectations for operators —
# env-up no longer dispatches off them; it discovers vars directly from
# $ENV_FILE so adding a new var to env.ts + .env.<env>.local is enough
# (no script change required).
#
# REQUIRED_VARS — preflight refuses to deploy if any are missing/empty.
# DATABASE_URL is fetched from Vercel Postgres (env-up auto-pulls).
REQUIRED_VARS=(
  NEXT_PUBLIC_APP_URL
  ANTHROPIC_API_KEY
  OPENAI_API_KEY
  RESEND_API_KEY
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_ID_SOLO
  STRIPE_PRICE_ID_TEAM
  FEEDBACK_HMAC_SECRET
  CRON_SECRET
)

# OPTIONAL_VARS — preflight warns when missing, doesn't block.
OPTIONAL_VARS=(
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_PHONE_NUMBER
  NSW_PLANNING_API_KEY
  DAEX_INGEST_ENABLED
  USD_TO_AUD
  SENTRY_DSN
  NEXT_PUBLIC_SENTRY_DSN
  NEXT_PUBLIC_POSTHOG_KEY
  NEXT_PUBLIC_POSTHOG_HOST
)

# ─── Env target dispatch ─────────────────────────────────────────────────────

ENV_TARGET="${1:-}"
SUBCOMMAND="${2:-help}"

case "$ENV_TARGET" in
  staging)
    ENV_FILE=".env.staging.local"
    ENV_TEMPLATE=".env.staging.example"
    ENV_LABEL="STAGING"
    REQUIRES_CONFIRM=0
    ;;
  production)
    ENV_FILE=".env.production.local"
    ENV_TEMPLATE=".env.production.example"
    ENV_LABEL="PRODUCTION"
    REQUIRES_CONFIRM=1
    ;;
  ""|help|-h|--help)
    SUBCOMMAND="help"
    ENV_TARGET=""
    ;;
  *)
    err "first argument must be 'staging' or 'production' (got: '$ENV_TARGET')"
    echo
    cmd_help() { :; }  # forward decl avoids "command not found" before its definition
    SUBCOMMAND="help"
    ENV_TARGET=""
    ;;
esac

# Set Vercel CLI to target the right project. Each env file should declare
# its own VERCEL_PROJECT_ID and VERCEL_ORG_ID — that lets one local clone
# deploy to either project without re-running `vercel link`. Falls back
# to the .vercel/ directory link if those aren't set.
load_vercel_target() {
  if [[ -f "$ENV_FILE" ]]; then
    local pid orgid
    pid=$(awk -F= '/^VERCEL_PROJECT_ID=/ {print $2}' "$ENV_FILE" | tr -d '"' | head -1)
    orgid=$(awk -F= '/^VERCEL_ORG_ID=/ {print $2}' "$ENV_FILE" | tr -d '"' | head -1)
    if [[ -n "$pid" ]]; then export VERCEL_PROJECT_ID="$pid"; fi
    if [[ -n "$orgid" ]]; then export VERCEL_ORG_ID="$orgid"; fi
  fi
}

confirm_or_abort() {
  (( REQUIRES_CONFIRM == 1 )) || return 0
  echo -e "${BOLD}${RED}⚠  ${ENV_LABEL} target.${NC} About to run '${SUBCOMMAND}' against $ENV_FILE."
  read -r -p "Type 'yes' to continue: " confirmation
  if [[ "$confirmation" != "yes" ]]; then
    err "aborted (confirmation required for $ENV_LABEL)"
    exit 1
  fi
}

# ─── Subcommands ──────────────────────────────────────────────────────────────

cmd_preflight() {
  info "[$ENV_LABEL] preflight: checking tooling and credentials ..."
  local fail=0

  if ! command -v vercel >/dev/null 2>&1; then
    err "vercel CLI not found. Install: npm i -g vercel"
    fail=1
  else
    ok "vercel CLI: $(vercel --version)"
  fi

  if ! command -v gh >/dev/null 2>&1; then
    warn "gh CLI not found (optional but useful)"
  else
    ok "gh CLI: $(gh --version | head -1)"
  fi

  if ! vercel whoami >/dev/null 2>&1; then
    err "vercel: not logged in. Run: vercel login"
    fail=1
  else
    ok "vercel: logged in as $(vercel whoami 2>/dev/null)"
  fi

  if [[ ! -f "$ENV_FILE" ]]; then
    warn "$ENV_FILE not found. Run: scripts/deploy.sh $ENV_TARGET init-env"
    fail=1
  else
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
    local missing=()
    for v in "${REQUIRED_VARS[@]}"; do
      if [[ -z "${!v:-}" ]]; then missing+=("$v"); fi
    done
    if (( ${#missing[@]} > 0 )); then
      err "$ENV_FILE missing required values: ${missing[*]}"
      fail=1
    else
      ok "$ENV_FILE: ${#REQUIRED_VARS[@]}/${#REQUIRED_VARS[@]} required vars set"
    fi
    local missing_opt=()
    for v in "${OPTIONAL_VARS[@]}"; do
      if [[ -z "${!v:-}" ]]; then missing_opt+=("$v"); fi
    done
    if (( ${#missing_opt[@]} > 0 )); then
      warn "optional vars unset (Month-1 OK to defer): ${missing_opt[*]}"
    fi

    # Sanity-check Stripe key matches the env's expected mode.
    if [[ "$ENV_LABEL" == "STAGING" && "${STRIPE_SECRET_KEY:-}" == sk_live_* ]]; then
      err "STAGING with sk_live_ key — refuse. Use sk_test_ on staging."
      fail=1
    fi
    if [[ "$ENV_LABEL" == "PRODUCTION" && "${STRIPE_SECRET_KEY:-}" == sk_test_* ]]; then
      warn "PRODUCTION with sk_test_ key — fine pre-launch but flip to sk_live_ before real customers."
    fi
  fi

  if [[ ! -f vercel.json ]]; then
    err "vercel.json not found at project root"
    fail=1
  else
    ok "vercel.json present ($(grep -c '"path"' vercel.json) crons declared)"
  fi

  # Schema-vs-template drift check (src/lib/env.ts ↔ .env*.example).
  if command -v pnpm >/dev/null 2>&1 && [[ -f scripts/check-env.ts ]]; then
    if pnpm exec tsx --env-file-if-exists="$ENV_FILE" scripts/check-env.ts >/tmp/check-env.log 2>&1; then
      ok "env schema in sync with templates"
    else
      err "env schema out of sync — see below:"
      cat /tmp/check-env.log >&2
      fail=1
    fi
  fi

  (( fail == 0 )) || { err "preflight failed"; exit 1; }
  ok "preflight passed"
}

cmd_link() {
  info "[$ENV_LABEL] linking to a Vercel project ..."
  if [[ -n "${VERCEL_PROJECT_ID:-}" ]]; then
    ok "VERCEL_PROJECT_ID set in $ENV_FILE — no .vercel/ link needed"
    return 0
  fi
  if [[ -d .vercel ]]; then
    ok "already linked (.vercel/ exists)"
    warn "for multi-project (staging+production), set VERCEL_PROJECT_ID + VERCEL_ORG_ID"
    warn "  in $ENV_FILE so the script can switch projects without re-linking."
    return 0
  fi
  vercel link --yes
  ok "linked"
  warn "next: provision Postgres in the Vercel dashboard (Storage → Create → Postgres)"
  warn "      then re-run: scripts/deploy.sh $ENV_TARGET env-up"
}

cmd_env_up() {
  info "[$ENV_LABEL] syncing env vars to Vercel (production scope) ..."
  if [[ -z "${VERCEL_PROJECT_ID:-}" ]] && [[ ! -d .vercel ]]; then
    err "not linked. Run: scripts/deploy.sh $ENV_TARGET link"
    exit 1
  fi
  confirm_or_abort

  # Pull Vercel-managed vars first (DATABASE_URL etc. from Vercel Postgres).
  info "pulling Vercel-managed vars (DATABASE_URL, etc.) ..."
  local vercel_pulled=".env.${ENV_TARGET}.vercel"
  vercel env pull --environment=production --yes "$vercel_pulled" >/dev/null 2>&1 || true
  if [[ -f "$vercel_pulled" ]] && grep -q "^DATABASE_URL=" "$vercel_pulled"; then
    ok "Vercel Postgres detected — DATABASE_URL is managed"
  else
    warn "no Vercel Postgres found — provision one in the dashboard before deploy"
  fi
  rm -f "$vercel_pulled"

  # Discover vars to push: every assignment in $ENV_FILE except Vercel-
  # managed ones (DATABASE_URL, POSTGRES_*, NEON_*, PG*) and reserved
  # prefixes (VERCEL_*). Schema-driven so any new var added to env.ts +
  # .env.<env>.local is picked up automatically — no allowlist
  # maintenance.
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  local pushed=0 skipped=0
  while IFS= read -r v; do
    local val="${!v:-}"
    if [[ -z "$val" ]]; then ((skipped+=1)); continue; fi
    # Idempotent: remove first (silently), then add.
    vercel env rm "$v" production --yes >/dev/null 2>&1 || true
    printf '%s' "$val" | vercel env add "$v" production >/dev/null
    echo "  pushed $v"
    ((pushed+=1))
  done < <(awk -F= '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
      name = $1
      # Skip Vercel-managed and reserved-prefix vars.
      if (name == "DATABASE_URL" \
        || name ~ /^POSTGRES_/ \
        || name ~ /^NEON_/ \
        || name ~ /^PG[A-Z]/ \
        || name ~ /^VERCEL_/) next
      print name
    }
  ' "$ENV_FILE" | sort -u)
  ok "env-up done — $pushed pushed, $skipped skipped (empty)"
}

cmd_deploy() {
  info "[$ENV_LABEL] deploying ..."
  if [[ -z "${VERCEL_PROJECT_ID:-}" ]] && [[ ! -d .vercel ]]; then
    err "not linked. Run: scripts/deploy.sh $ENV_TARGET link"
    exit 1
  fi
  confirm_or_abort
  # vercel-build script handles: prisma generate + migrate deploy + seed + dev-seed (skipped in prod) + next build
  vercel deploy --prod --yes
  ok "deploy triggered — Vercel will run vercel-build (migrate + seed + next build)"
}

cmd_smoke() {
  info "[$ENV_LABEL] smoke tests ..."
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  local url="${NEXT_PUBLIC_APP_URL:-}"
  if [[ -z "$url" ]]; then
    err "NEXT_PUBLIC_APP_URL not set in $ENV_FILE"
    exit 1
  fi
  url="${url%/}"

  local fail=0
  check() {
    local path="$1" expected="$2" desc="${3:-$1}"
    local got
    got=$(curl -sL -o /dev/null -w '%{http_code}' "$url$path" || echo "000")
    if [[ "$got" == "$expected" ]]; then
      ok "$desc → $got"
    else
      err "$desc → $got (expected $expected)"
      fail=1
    fi
  }

  check "/" 200 "landing page"
  check "/login" 200 "login page"
  check "/signup" 200 "signup page"
  check "/privacy" 200 "privacy page"
  # /api/auth/me requires DB. Unauthenticated → 401 (not 500 = DB unreachable).
  check "/api/auth/me" 401 "auth/me (DB connectivity check)"

  (( fail == 0 )) || { err "smoke tests failed"; exit 1; }
  ok "smoke tests passed"
}

cmd_init_env() {
  if [[ -f "$ENV_FILE" ]]; then
    err "$ENV_FILE already exists — refusing to overwrite. Delete it first if you want a fresh template."
    exit 1
  fi
  if [[ ! -f "$ENV_TEMPLATE" ]]; then
    # Fall back to .env.production.example if the env-specific template doesn't exist yet.
    if [[ -f ".env.production.example" ]]; then
      warn "$ENV_TEMPLATE not found, falling back to .env.production.example"
      ENV_TEMPLATE=".env.production.example"
    else
      err "$ENV_TEMPLATE not found at project root"
      exit 1
    fi
  fi
  cp "$ENV_TEMPLATE" "$ENV_FILE"
  ok "created $ENV_FILE — fill in real values, then re-run: scripts/deploy.sh $ENV_TARGET preflight"
}

cmd_all() {
  cmd_preflight
  cmd_link
  cmd_env_up
  cmd_deploy
  echo
  warn "give Vercel ~60s to finish the build, then run: scripts/deploy.sh $ENV_TARGET smoke"
}

cmd_help() {
  cat <<EOF
PI-AU deploy — two-environment automation (staging + production).

Usage: scripts/deploy.sh <env> <subcommand>

  <env>: staging | production

Subcommands:
  preflight   verify CLIs, vercel auth, env file, vercel.json
  init-env    copy template → .env.<env>.local
  link        run \`vercel link\` (one-time per machine, per project)
  env-up      upload env vars from .env.<env>.local to Vercel
  deploy      \`vercel deploy --prod\` (runs vercel-build → migrate + seed)
  smoke       curl tests against \$NEXT_PUBLIC_APP_URL from .env.<env>.local
  all         preflight → link → env-up → deploy (skips smoke; run manually)
  help        this message

Examples:
  scripts/deploy.sh staging preflight       # verify staging is ready
  scripts/deploy.sh staging deploy          # deploy to staging.pi-au.com
  scripts/deploy.sh production deploy       # deploy to www.pi-au.com (prompts y/N)

Multi-project support:
  Each .env.<env>.local should declare:
    VERCEL_PROJECT_ID=prj_...
    VERCEL_ORG_ID=team_... (or your personal org id)
  This lets one local clone deploy to either project without re-linking.
  If unset, the script falls back to the existing .vercel/ link.

Manual prerequisites (one-off, see docs/19-deploy-runbook.md):
  - Vercel project provisioned per environment (Postgres attached)
  - Resend domain verified (DNS records at your registrar)
  - Stripe keys + webhook secret + price IDs created (test for staging, live for prod)
  - Sentry project + DSN
  - PostHog project + API key (optional Month 1)
EOF
}

# ─── Dispatch ────────────────────────────────────────────────────────────────

# If env target wasn't valid, only "help" is allowed.
if [[ -z "$ENV_TARGET" ]]; then
  cmd_help
  exit 0
fi

# Load Vercel project targeting from the env file so all `vercel` calls in
# the subcommands hit the right project.
load_vercel_target

case "$SUBCOMMAND" in
  preflight)  cmd_preflight ;;
  link)       cmd_link ;;
  env-up)     cmd_env_up ;;
  deploy)     cmd_deploy ;;
  smoke)      cmd_smoke ;;
  init-env)   cmd_init_env ;;
  all)        cmd_all ;;
  help|-h|--help) cmd_help ;;
  *) err "unknown subcommand: $SUBCOMMAND"; cmd_help; exit 1 ;;
esac
