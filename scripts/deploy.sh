#!/usr/bin/env bash
# PI-AU production deploy automation.
# Roadmap-Month-1 (docs/18-roadmap-3-month.md, Option A): Ship-and-Sell.
#
# What this scripts: env validation, bulk env-var upload, deploy, smoke tests.
# What it cannot script (must be done in dashboards once): Resend domain DNS,
# Stripe live-key fetch, Vercel Postgres provisioning, PostHog/Sentry account
# bootstrap. Those are listed in docs/19-deploy-runbook.md.
#
# Usage:
#   scripts/deploy.sh preflight   # check CLIs, auth, env file
#   scripts/deploy.sh link        # `vercel link` (one-time per machine)
#   scripts/deploy.sh env-up      # upload env vars from .env.production.local
#   scripts/deploy.sh deploy      # vercel deploy --prod (runs vercel-build → migrate + seed)
#   scripts/deploy.sh smoke       # curl-based smoke tests against the prod URL
#   scripts/deploy.sh all         # the four above, in order
#   scripts/deploy.sh init-env    # write a fresh .env.production.local template

set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE="${ENV_FILE:-.env.production.local}"
ENV_TEMPLATE=".env.production.example"

# Required vars — script refuses to deploy if any of these are missing/empty
# in $ENV_FILE. DATABASE_URL is fetched from Vercel Postgres (env-up auto-pulls).
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

# Optional but recommended for Month 1 — script warns but doesn't block.
OPTIONAL_VARS=(
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_PHONE_NUMBER
  NSW_PLANNING_API_KEY
  DA_LEADS_API_KEY
  DAEX_INGEST_ENABLED
  USD_TO_AUD
  SENTRY_DSN
  NEXT_PUBLIC_SENTRY_DSN
  NEXT_PUBLIC_POSTHOG_KEY
  NEXT_PUBLIC_POSTHOG_HOST
)

# ─── Colours ──────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; CYAN=''; NC=''
fi
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*" >&2; }
info()  { echo -e "${CYAN}→${NC} $*"; }

# ─── Subcommands ──────────────────────────────────────────────────────────────

cmd_preflight() {
  info "preflight: checking tooling and credentials ..."
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
    warn "$ENV_FILE not found. Run: scripts/deploy.sh init-env"
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
  info "linking to a Vercel project ..."
  if [[ -d .vercel ]]; then
    ok "already linked (.vercel/ exists)"
    return 0
  fi
  vercel link --yes
  ok "linked"
  warn "next: provision Postgres in the Vercel dashboard (Storage → Create → Postgres)"
  warn "      then re-run: scripts/deploy.sh env-up"
}

cmd_env_up() {
  info "syncing env vars to Vercel (production) ..."
  if [[ ! -d .vercel ]]; then
    err "not linked. Run: scripts/deploy.sh link"
    exit 1
  fi

  # Pull Vercel-managed vars first (DATABASE_URL etc. from Vercel Postgres).
  info "pulling Vercel-managed vars (DATABASE_URL, etc.) ..."
  vercel env pull --environment=production --yes ".env.production.vercel" >/dev/null 2>&1 || true
  if [[ -f .env.production.vercel ]] && grep -q "^DATABASE_URL=" .env.production.vercel; then
    ok "Vercel Postgres detected — DATABASE_URL is managed"
  else
    warn "no Vercel Postgres found — provision one in the dashboard before deploy"
  fi
  rm -f .env.production.vercel

  # Push our vars from $ENV_FILE.
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  local pushed=0 skipped=0
  local all_vars=("${REQUIRED_VARS[@]}" "${OPTIONAL_VARS[@]}")
  for v in "${all_vars[@]}"; do
    local val="${!v:-}"
    if [[ -z "$val" ]]; then ((skipped+=1)); continue; fi
    # Idempotent: remove first (silently), then add.
    vercel env rm "$v" production --yes >/dev/null 2>&1 || true
    printf '%s' "$val" | vercel env add "$v" production >/dev/null
    echo "  pushed $v"
    ((pushed+=1))
  done
  ok "env-up done — $pushed pushed, $skipped skipped (empty)"
}

cmd_deploy() {
  info "deploying to production ..."
  if [[ ! -d .vercel ]]; then
    err "not linked. Run: scripts/deploy.sh link"
    exit 1
  fi
  # vercel-build script handles: prisma generate + migrate deploy + seed + dev-seed (skipped in prod) + next build
  vercel deploy --prod --yes
  ok "deploy triggered — Vercel will run vercel-build (migrate + seed + next build)"
}

cmd_smoke() {
  info "smoke tests ..."
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
    err "$ENV_TEMPLATE not found at project root"
    exit 1
  fi
  cp "$ENV_TEMPLATE" "$ENV_FILE"
  ok "created $ENV_FILE — fill in real values, then re-run: scripts/deploy.sh preflight"
}

cmd_all() {
  cmd_preflight
  cmd_link
  cmd_env_up
  cmd_deploy
  echo
  warn "give Vercel ~60s to finish the build, then run: scripts/deploy.sh smoke"
}

cmd_help() {
  cat <<EOF
PI-AU deploy — Month 1 Ship-and-Sell automation.

Usage: scripts/deploy.sh <subcommand>

  preflight   verify CLIs, vercel auth, env file, vercel.json
  init-env    copy .env.production.example → .env.production.local (template)
  link        run \`vercel link\` (one-time per machine)
  env-up      upload env vars from .env.production.local to Vercel
  deploy      \`vercel deploy --prod\` (runs vercel-build → migrate + seed)
  smoke       curl tests against \$NEXT_PUBLIC_APP_URL
  all         preflight → link → env-up → deploy (skips smoke; run manually)
  help        this message

Manual prerequisites (one-off, see docs/19-deploy-runbook.md):
  - Vercel Postgres attached to the project
  - Resend domain verified (DNS records at your registrar)
  - Stripe live keys + webhook secret + price IDs created
  - Sentry project + DSN
  - PostHog project + API key (optional Month 1)
EOF
}

# ─── Dispatch ────────────────────────────────────────────────────────────────
case "${1:-help}" in
  preflight)  cmd_preflight ;;
  link)       cmd_link ;;
  env-up)     cmd_env_up ;;
  deploy)     cmd_deploy ;;
  smoke)      cmd_smoke ;;
  init-env)   cmd_init_env ;;
  all)        cmd_all ;;
  help|-h|--help) cmd_help ;;
  *) err "unknown subcommand: $1"; cmd_help; exit 1 ;;
esac
