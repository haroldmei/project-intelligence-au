# Tech Stack Contract — ProjectIntelligence AU (PI-AU)

## Date: 2026-04-28
## Stack version: 2026-Q2
## Scale tier: preview
## Wedge: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo (GST included), signup in 60 seconds.
## Constraints: ai_heavy, mobile_first

<!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo (GST included), signup in 60 seconds. -->

> This document is the **binding contract** for tech choices. Every
> downstream skill reads it. To change a vendor or pin, rerun
> `tech-stack-selector`. Do not silently substitute.

## 1. Stack matrix

```yaml
runtime:
  language: typescript
  node: "22.x"
  package_manager: pnpm

frontend:
  framework: next
  next_version: "15"
  router: app
  react_version: "19"
  css: tailwind
  tailwind_version: "4"
  responsive_priority: mobile-first        # constraint: mobile_first=true
  state:
    server: server-components
    client: zustand-or-swr
  forms: react-hook-form
  ui_kit: shadcn-ui
  viewport_first: true                     # constraint: mobile_first=true; digest cards are the primary mobile UI

backend:
  framework: next-api-routes
  orm: prisma
  prisma_version: "5"
  validators: zod
  zod_version: "3"

database:
  engine: postgres
  postgres_version: "16"
  pgvector: true                           # constraint: ai_heavy=true; embeddings stored alongside DA records
  pgvector_version: "0.7"                 # 0.7+ for HNSW index support
  pooler: prisma-accelerate                # preview tier; pgbouncer sidecar deferred to launch
  vector_note: |
    Single Postgres node with pgvector. Do NOT add a separate Qdrant or
    Pinecone cluster. Query latency is not the bottleneck at ≤10k DAs/week;
    revisit at scale tier if HNSW index scan > 50ms.

cache:
  engine: redis
  redis_version: "7"
  required: false                          # preview tier; no queue; no session sharding

queue:
  engine: none                             # preview tier; BullMQ deferred to launch+
  required: false
  weekly_cron: |
    The Sunday 5 pm (17:00 AEST = 07:00 UTC) digest job is a single scheduled cron (Vercel Cron or
    Fly scheduled process). It is NOT a queue worker. It must fail loud and
    re-fire on transient error; use a simple retry wrapper, not BullMQ.

testing:
  unit: vitest
  e2e: playwright
  load: k6
  mutation: stryker
  property: fast-check

observability:
  logging: pino
  error_tracking: sentry
  metrics: provider-native
  token_metrics: required                  # constraint: ai_heavy=true; AUD 0.50/user/month ceiling
  uptime: one-check                        # preview tier; single uptime monitor for the Sunday cron endpoint

auth:
  default: lucia
  session: jwt-with-refresh
  password_hashing: argon2id
  mfa: email-otp-or-sms-otp               # wedge: no SSO, no Google Workspace, no enterprise IDP
  multi_user: false                        # V1: single-user accounts only; Team tier is flat seat list

email:
  provider: resend
  templates: react-email
  sunday_digest_path: critical             # The Sunday 17:00 AEST email is the highest-availability send path
  sms_provider: twilio                     # SMS is first-class (top-3 DA cards per wedge step 5)

analytics:
  product: posthog
  consent: required-before-load

payments:
  provider: stripe
  billing_region: au                       # AUD pricing; GST via Stripe AU
  # repriced 2026-07 — solo AUD 99 inc GST, 28-day trial, Team deferred pending multi-seat; see docs/16
  plans:
    solo: "AUD 99/mo (GST included)"
    team: "deferred — see docs/16 (multi-seat not yet shipped)"
  trial: "28-day full-access; no free tier"

ai:
  provider: anthropic
  models:
    primary: claude-haiku-4-5             # batch LLM rerank in the 3-stage pipeline; meets precision targets at < AUD 0.50/user/month
    advanced: claude-sonnet-4-6           # reserved for explanation generation, ad-hoc queries — not in MVP hot path (V1.1+)
    taste: claude-opus-4-7                # reserved for eval harness validation runs
    # Haiku is primary because it meets precision targets at < AUD 0.50/user/month; Sonnet reserved for V1.1+ features.
  embedding_model: text-embedding-3-small  # OpenAI embeddings via API; 1536-dim; AUD cost < $0.01/1k tokens
  embedding_provider: openai               # Anthropic does not expose a standalone embedding endpoint in 2026-Q2
  vector_store: pgvector                   # inside existing Postgres; no separate cluster at preview tier
  eval_harness: promptfoo                  # located at eval/; 500-pair labelled roofing set is a launch gate
  eval_harness_path: "eval/"
  cost_tracking: required                  # AUD 0.50/user/month ceiling; log token usage per user per weekly run
  cost_tracking_impl: |
    Instrument every LLM call with {user_id, phase, input_tokens, output_tokens,
    model} written to a `ai_cost_log` Postgres table. Aggregate weekly per user.
    Alert (Sentry) if any user exceeds AUD 0.50 in the weekly digest run.
  relevance_pipeline: |
    1. Rule pass: keyword filter (roofing vocabulary list) — fast, zero cost
    2. Embedding pass: pgvector cosine similarity vs saved-query embedding
    3. LLM rerank: claude-haiku-4-5 scores top-30 candidates, returns top 5–15
    4. Per-user thumbs rerank: applies after ≥ 200 labelled pairs (week 4–6)
  eval_launch_gate: "precision ≥ 0.7 at recall ≥ 0.6 on 500-pair labelled set"

ci:
  provider: buildkite                      # org has $BK_API_TOKEN provisioned; cheaper than GitHub-hosted runners
  registry: docker-hub
  pipeline_file: ".buildkite/pipeline.yml"

deploy:
  preview_tier_target: vercel              # Next.js framework; Vercel is native deploy target
  iac: none                                # preview tier; NO Terraform until launch tier
  cron_target: vercel-cron                 # Vercel Cron for the Sunday 17:00 AEST (07:00 UTC) digest trigger
  environment: preview

cloud:
  provider: gcp                            # $PROJECT_ID available in env
  prefer_reason: GCP credentials provisioned in environment

security:
  password_hashing: argon2id
  secrets_manager: gcp-secret-manager
  csp: required
  rate_limiting: required
  public_data_only: true                   # binding; no scraping of Cordell/LeadManager/EstimateOne

feature_flags:
  provider: posthog-flags                  # piggybacks on analytics; no separate vendor

storage:
  blobs: gcs                               # GCP Cloud Storage
  cdn: provider-native
```

## 2. Decisions (deltas from default matrix)

- `database.pgvector: true` — constraint `ai_heavy=true`; embeddings for DA relevance scoring live in the same Postgres instance; no separate vector cluster at preview tier (wedge designer constraint)
- `ai.embedding_provider: openai` (text-embedding-3-small) over Anthropic — Anthropic does not expose a standalone embedding API in 2026-Q2; OpenAI text-embedding-3-small is cost-effective at < $0.01/1k tokens and well-supported by pgvector tooling
- `ai.models.primary: claude-haiku-4-5`, `advanced: claude-sonnet-4-6` — Haiku-4-5 for batch LLM rerank in the 3-stage pipeline (meets precision targets at < AUD 0.50/user/month); Sonnet-4-6 reserved for explanation generation and ad-hoc queries (V1.1+, not in MVP hot path)
- `ai.cost_tracking: required` — constraint `ai_heavy=true`; AUD 0.50/user/month ceiling is a wedge-level unit-economics gate, not a stretch goal
- `frontend.responsive_priority: mobile-first` and `viewport_first: true` — constraint `mobile_first=true`; digest is read on a phone in a ute; Tailwind utility classes applied mobile-first throughout
- `email.sms_provider: twilio` — wedge workflow step 5 specifies SMS as first-class channel (top-3 DA cards); Resend handles transactional email only
- `queue.engine: none` — preview tier; the Sunday 17:00 AEST cron is a single Vercel Cron job, not a queue worker; BullMQ deferred to launch+
- `auth.mfa: email-otp-or-sms-otp` — wedge auth-engineer constraint: no SSO, no enterprise IDP, single-user V1 accounts; Lucia with magic-link or password + OTP
- `deploy.iac: none` — preview tier; NO Terraform; Vercel preview deploy only; Terraform added at launch tier
- `cache.required: false` — preview tier with no queue; Redis deferred to launch+
- `ci.provider: buildkite` — org has `$BK_API_TOKEN` provisioned; cheaper than GitHub Actions hosted runners at this org's scale
- `payments.billing_region: au` — AU-only V1; AUD pricing; GST via Stripe AU; Paddle not needed (no EU/global billing)
- `observability.token_metrics: required` — constraint `ai_heavy=true`; per-user token cost logged to `ai_cost_log` table; Sentry alert on ceiling breach

## 3. Negative space (not in stack)

```yaml
not_in_stack:
  kubernetes: "preview tier; Cloud Run / Vercel is sufficient; k8s overhead unjustified for ≤100 users"
  graphql: "REST + Zod end-to-end type safety is simpler for this single-flow MVP"
  microservices: "wedge designer constraint: one Postgres + one ingestion worker + one web app + one cron is the complexity ceiling until 100 paying customers"
  bullmq: "preview tier; the single Sunday cron does not need a queue; deferred to launch+"
  terraform: "preview tier; no IaC until launch tier per scale-tier delta"
  kafka: "data volume ≤10k DA records/week; far below Kafka justification threshold"
  qdrant: "pgvector inside existing Postgres is sufficient at ≤10k DAs/week; separate vector cluster is over-engineering for preview"
  pinecone: "same rationale as qdrant; pgvector wins until query latency is provably the bottleneck"
  sendgrid: "Resend is the 2026 default; SendGrid retired from stack matrix"
  bcrypt: "argon2id is the 2026 password-hashing default; bcrypt retired"
  github-actions: "buildkite is cheaper with org's existing $BK_API_TOKEN and self-hosted agents"
  clerk: "regulated=false and multi_tenant_b2b=false; Lucia is sufficient and avoids per-MAU billing at preview scale"
  auth0: "regulated=false; auth0 pricing unjustified for preview; Lucia is the default"
  paddle: "eu_global_billing=false; AU-only V1; Stripe AU handles GST"
  websockets: "realtime=false; weekly Sunday digest cadence; no live cursors or presence"
  expo_native: "mobile_first=true forces responsive Tailwind first; native app is V2 or later"
  redis_queue: "no async job queue at preview tier; Vercel Cron covers the single weekly cron"
```

## 4. AI features spec (ai_heavy=true)

This section is the binding input for the `ai-features` skill phase.

### Relevance pipeline

| Stage | Tool | Purpose | Cost tier |
|---|---|---|---|
| Rule pass | In-process TypeScript | Roofing vocabulary keyword filter; zero LLM cost | Free |
| Embedding pass | OpenAI text-embedding-3-small + pgvector | Cosine similarity vs saved-query embedding; rank top-50 candidates | ~$0.002/run |
| LLM rerank | claude-haiku-4-5 | Score top-30, return top 5–15 with one-line "why" | ~$0.05/user/week |
| Per-user thumbs | Postgres-stored weights | Active after ≥200 labelled pairs (~week 4–6); no additional LLM cost | Free |

### Eval harness

- Location: `eval/`
- Framework: promptfoo
- Dataset: 500 labelled (DA description, relevant: bool) pairs — roofing-specific
- Launch gate: precision ≥ 0.7 at recall ≥ 0.6 on the full 500-pair set
- Kill switch 5.4: if precision/recall cannot exceed Cordell keyword-baseline by ≥3× after 4 weeks of iteration, revert to manual curation

### Cost tracking

- Table: `ai_cost_log (user_id, phase, model, input_tokens, output_tokens, cost_aud, week_start, created_at)`
- Ceiling: AUD 0.50/user/month on AI inference
- Alert: Sentry alert if any user's weekly run exceeds AUD 0.13 (weekly equivalent of monthly ceiling)

## 5. Mobile-first spec (mobile_first=true)

This section is the binding input for the `ux-designer` and `frontend-developer` skills.

- Tailwind responsive prefix order: `base (mobile) → sm → md → lg → xl`
- Digest card layout: full-width stacked cards on mobile; two-column grid at `md:`
- SMS is a first-class channel: top-3 DA cards delivered via Twilio; tap-to-open-portal link included
- Thumb feedback (👍/👎) must be a single tap on mobile — no hover states as primary interaction
- Viewport: `<meta name="viewport" content="width=device-width, initial-scale=1">` required
- Touch targets: minimum 44×44px per WCAG 2.5.5
- Desktop is the secondary surface; do not design desktop-first and adapt down

## 6. Quarterly review

Stack version pins are reviewed each quarter. Next review: **2026-07-28**.

At next review, evaluate:
- pgvector vs turbopuffer if embedding count exceeds 1M or HNSW scan > 50ms
- Tier upgrade from `preview` to `launch` if paying seats > 250 or ARR > AUD 1M
- Expo native app if mobile-first usage data supports it

## 7. How downstream skills use this

| Skill | Reads from contract |
|---|---|
| designer | runtime, frontend, backend, database, cache, queue, ai, security |
| backend-developer | runtime, backend, database, validators, auth, ai, email.sms_provider |
| frontend-developer | frontend (framework, css, responsive_priority, state, forms, ui_kit) |
| db-migrator | database (engine, version, pgvector, pgvector_version), ai.cost_tracking_impl |
| ux-designer | frontend.css, frontend.ui_kit, mobile-first spec (§5) |
| api-docs | backend.validators, backend.framework |
| email-templates | email (provider, sms_provider, sunday_digest_path) |
| background-jobs | queue (none at preview), weekly_cron spec |
| analytics | analytics |
| observability | observability, ai.cost_tracking, ai.token_metrics |
| cicd | ci (provider: buildkite, pipeline_file) |
| deployer | deploy (preview_tier_target: vercel, iac: none), cloud |
| auth-engineer | auth (lucia, argon2id, email-otp-or-sms-otp, no SSO) |
| ai-features | ai (full §4 spec: provider, models, embedding_model, vector_store, eval, cost_tracking) |
| pricing | payments (stripe AU, AUD 99 Solo-only, 28-day trial, no free tier; repriced 2026-07, see docs/16) |
| legal-compliance | security.public_data_only, payments.billing_region |

---

## Status: LOCKED

All self-critique checks passed:
- [x] Every override has a one-line rationale
- [x] Tier deltas applied (preview: no Terraform, no BullMQ, no multi-region)
- [x] No constraint flag dropped (ai_heavy → pgvector + cost_tracking + token_metrics + eval; mobile_first → responsive_priority + viewport_first + SMS + touch targets)
- [x] Versions pinned to majors (node 22.x, next 15, prisma 5, zod 3, postgres 16, redis 7, tailwind 4, pgvector 0.7)
- [x] `not_in_stack` has 15 entries (≥3 minimum satisfied)
- [x] CI default: buildkite (org has $BK_API_TOKEN)
- [x] Auth: lucia (regulated=false, multi_tenant_b2b=false)
- [x] Deploy: vercel preview (Next.js, preview tier)
- [x] No Terraform (preview tier)
- [x] No BullMQ (preview tier, single cron)
- [x] No PRR (preview tier)
