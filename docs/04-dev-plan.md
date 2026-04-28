# Auth Dev Plan — ProjectIntelligence AU (PI-AU)

<!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds. -->
<!-- STACK: docs/00-tech-stack.md @ 2026-Q2 | Phase: auth-engineer -->

**Document ID:** PI-AU-DEV-PLAN-001
**Version:** 1.0
**Date:** 2026-04-28
**Author:** auth-engineer phase
**Scale tier:** preview

---

## 1. Auth Surface Area

| Method | Path | Auth Required | Notes |
|--------|------|---------------|-------|
| `POST` | `/api/auth/signup` | None | Creates user (trade=roofing), OTP dispatched, returns 201 + session cookie |
| `POST` | `/api/auth/verify-email` | Lucia session | 6-digit OTP → `emailVerified=true` |
| `POST` | `/api/auth/verify-email/resend` | Lucia session | Throttled 1/min/account; invalidates prior OTP |
| `POST` | `/api/auth/login` | None | argon2id verify → Lucia session → Set-Cookie |
| `POST` | `/api/auth/logout` | Lucia session (optional) | Invalidates session; clears cookie |
| `POST` | `/api/auth/password-reset/request` | None | Creates reset OTP; stubs email (Phase 6.9) |
| `POST` | `/api/auth/password-reset/confirm` | None (token-based) | OTP + email + new password; invalidates all sessions |
| `GET`  | `/api/auth/me` | Lucia session | Returns minimal `MeResponse` for portal hydration |

All routes return JSON. All mutating routes use `Response.json(...)` (Next.js 15 App Router style).

---

## 2. Session Shape

Lucia v3 exposes these user attributes (configured in `src/lib/auth/lucia.ts`):

```typescript
// Lucia DatabaseUserAttributes → getUserAttributes()
{
  email: string;              // citext in DB
  emailVerified: boolean;
  subscriptionStatus: string; // trial|active|cancelled|past_due
  trade: string;              // 'roofing' locked in V1
}
```

`GET /api/auth/me` returns:

```typescript
{
  userId: string;
  email: string;
  emailVerified: boolean;
  subscriptionStatus: string;
  trade: string;
  sessionExpiresAt: string;   // ISO 8601; rolling 30-day expiry (NFR-017)
}
```

Cookie attributes: `httpOnly`, `SameSite=Lax`, `Secure` (production). Source: `src/lib/auth/lucia.ts`.

---

## 3. Rate-Limit Policy Table

Source: system-design §6.4. Defaults applied where the doc is silent (noted inline).

| Route | Limit | Window | Key | Implementation |
|-------|-------|--------|-----|----------------|
| `POST /api/auth/signup` | 5 | 1 min | IP | `rateLimitByIp(ip, 'signup')` |
| `POST /api/auth/login` | 5 | 1 min | IP | `rateLimitByIp(ip, 'login')` |
| `POST /api/auth/password-reset/request` | 5 | 1 min | IP | `rateLimitByIp(ip, 'password-reset-request')` |
| `POST /api/auth/verify-email` | 10 | 1 hr | user id | `rateLimitOtpVerifyByUser(userId)` |
| `POST /api/auth/verify-email/resend` | 1 | 1 min | account (user id) | `rateLimitResendByAccount(userId)` — **assumption: 1/min/account; system-design is silent** |
| `POST /api/auth/logout` | n/a | — | — | Session-gated; no limit |
| `POST /api/auth/password-reset/confirm` | n/a | — | — | OTP is self-limiting (10-min expiry, single-use) |
| `GET /api/auth/me` | n/a | — | — | Session-gated; no limit |

Implementation: fixed-window in-memory Map. Non-strict across Vercel instances at preview tier.
Production swap: Postgres row `(key TEXT, window_start TIMESTAMPTZ, count INT)` with atomic upsert,
or Upstash Redis when > 50 paid users or brute-force observed. See `src/lib/auth/rate-limit.ts`.

---

## 4. Threat Model

| Threat | Control | Notes |
|--------|---------|-------|
| **Brute-force login** | Rate limit 5/min/IP + argon2id (~0.5s/attempt) | Economic deterrent even without strict cross-instance limiting at preview tier |
| **Credential stuffing** | Rate limit 5/min/IP | `[V2]` Add haveibeenpwned API check at signup + login (deferred; no new dep at preview) |
| **OTP brute-force** | 10/hr/user + single-use consume + 10-min expiry | argon2id-hashed OTP code in DB |
| **Email enumeration on signup** | 409 with generic message | Same error regardless of which constraint failed |
| **Email enumeration on password reset** | Always 200 | Never discloses whether email exists |
| **Session fixation** | Lucia creates a new session on every login | Old sessions are NOT inherited; Lucia default behaviour |
| **CSRF** | `SameSite=Lax` cookie + state-changing routes require POST (no GET mutations) | Double-submit pattern available if `SameSite=None` ever needed for cross-origin |
| **Timing oracle on login** | Always runs `argon2.verify` with a dummy hash if user not found | Prevents differentiating "no user" from "wrong password" by response time |
| **Session hijacking** | `httpOnly` cookie; `Secure` in production | JS cannot read the cookie; transmitted only over HTTPS |
| **Token accumulation (OTP)** | `createOtp()` consumes all prior live OTPs for user+purpose before inserting new one | Prevents replay of stale codes |

---

## 5. Handoff to Downstream Phases

### frontend-developer

All auth routes return JSON. The UI lives in `src/app/(auth)/*` — **frontend-developer will build these against the schemas in `src/lib/auth/schemas.ts`.**

Central Zod schemas (re-import for react-hook-form + @hookform/resolvers/zod):

- `SignupSchema` — email, password, mobile_e164, acceptTerms
- `LoginSchema` — email, password
- `OtpVerifySchema` — code (6-digit)
- `PasswordResetRequestSchema` — email
- `PasswordResetConfirmSchema` — token, password (+ email in request body)

### email-templates (Phase 6.9)

Three call sites are stubbed with `console.log` + `// TODO[email-templates]:` comments:

| File | Template needed | Data passed |
|------|-----------------|-------------|
| `src/app/api/auth/signup/route.ts` | `verify-email` | `{ code: otpCode }` |
| `src/app/api/auth/verify-email/resend/route.ts` | `verify-email` | `{ code: otpCode }` |
| `src/app/api/auth/password-reset/request/route.ts` | `password-reset` | `{ code: resetCode }` |

Replace each `console.log` with `await sendEmail(...)` once the `sendEmail()` helper is available in `src/lib/email/`.

### backend-developer

Backend modules (`ingestion`, `relevance`, `digest`, `feedback`, `billing`, `portal`, `webhooks`) use `validateRequest()` from `src/lib/auth/session.ts` to enforce authentication on all protected routes.

---

## 6. Files Written by auth-engineer Phase

| File | Purpose |
|------|---------|
| `src/lib/auth/schemas.ts` | Central Zod schemas (all auth flows) |
| `src/lib/auth/otp.ts` | 6-digit OTP generation, storage (argon2id hash), validate+consume |
| `src/lib/auth/rate-limit.ts` | Fixed-window in-memory limiter; preconfigured helpers |
| `src/lib/auth/session.ts` | `validateRequest()` — server helper for API routes + Server Components |
| `src/app/api/auth/signup/route.ts` | Signup handler |
| `src/app/api/auth/verify-email/route.ts` | OTP verification |
| `src/app/api/auth/verify-email/resend/route.ts` | OTP resend (throttled) |
| `src/app/api/auth/login/route.ts` | Login handler |
| `src/app/api/auth/logout/route.ts` | Logout handler |
| `src/app/api/auth/password-reset/request/route.ts` | Reset request (stub email) |
| `src/app/api/auth/password-reset/confirm/route.ts` | Reset confirm (consume OTP, re-hash) |
| `src/app/api/auth/me/route.ts` | Session/user shape for portal |
| `docs/04-dev-plan.md` | This document |

Previously written (prior agent run, not modified):

| File | Purpose |
|------|---------|
| `src/lib/auth/lucia.ts` | Lucia v3 setup with Prisma adapter |
| `src/lib/auth/passwords.ts` | argon2id hash/verify/policy |
| `prisma/schema.prisma` | Full schema (User, Session, EmailOtp, …) |

---

*End of auth dev plan v1.0.*

---

## AI Features

<!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds. -->
<!-- STACK: docs/00-tech-stack.md @ 2026-Q2 | Phase: ai-features -->

**Document section:** PI-AU-DEV-PLAN-002 (AI Features)
**Date appended:** 2026-04-28
**Author:** ai-features phase

The relevance pipeline is the only AI in V1 (per wedge §6 ai-features
constraint). It is a pure function (`runRelevancePipeline` in
`src/lib/ai/relevance-pipeline.ts`) with all DB access injected — the
backend-developer phase wires it into `src/modules/relevance/` and calls
it from the Sunday-cron handler in `src/modules/digest/`.

### A.1 Model routing

| Stage | Model | Provider | Why |
|-------|-------|----------|-----|
| Embedding (saved query at signup, DAs lazily at digest time) | `text-embedding-3-small` (1536-dim) | OpenAI | Contract `ai.embedding_model`; AUD 0.02 USD per 1M tokens; Anthropic does not expose a standalone embedding endpoint at 2026-Q2 |
| LLM rerank — primary | `claude-haiku-4-5` | Anthropic | Contract `ai.models.primary`; meets precision targets at < AUD 0.50/user/month |
| LLM rerank — fallback (low-confidence rows only) | `claude-sonnet-4-6` | Anthropic | Contract `ai.models.advanced`; ~5× cost; only re-runs candidates where haiku self-reports `confidence < 0.5` |
| Eval validation runs (gold-set scoring outside CI) | `claude-opus-4-7` | Anthropic | Contract `ai.models.taste`; reserved for ground-truth disagreements; not in hot path |

Routing decision lives in `src/lib/ai/rerank.ts::FALLBACK_CONFIDENCE_THRESHOLD = 0.5`. Adjusting the threshold is a prompt-version change (bump `version` in `src/prompts/rerank.system.md`).

### A.2 Cost ledger

Schema (already present in `prisma/schema.prisma`):

```
ai_cost_log (
  id, user_id, phase ('embedding'|'rerank'),
  model, input_tokens, output_tokens, cost_aud,
  week_start (Monday 00:00 AEST date), created_at
)
INDEX (user_id, week_start)
```

Wrapper: `src/lib/ai/cost-ledger.ts`.

- `priceFor(model, in, out)` translates token counts to AUD using `RATES_USD_PER_M` × `USD_TO_AUD` (default 1.52, overridable via `USD_TO_AUD` env at quarterly review).
- `recordAiCost()` is fire-and-forget — never throws; logs and continues. Cost-tracking failure must NOT bring down the digest cron.
- `weeklyCostAud(userId, weekStart)` aggregates a user's spend for the kill-switch query.
- `weekStartAEST()` anchors all rows to the Monday 00:00 AEST that contains the digest run, so weekly aggregation is timezone-stable.

ASSUMPTION (no schema change): the cost-cap kill switch reads `weeklyCostAud` at the START of each user's pipeline pass. If a per-user `aiKillSwitchActive` boolean column on `users` is preferred (avoids re-aggregation on every digest run), backend-developer can add it then; today the aggregation is cheap at preview-tier volume.

### A.3 Prompt versioning policy

Prompts live as Markdown with YAML frontmatter in `src/prompts/`:

- `rerank.system.md` — `version: 1.0.0`, `last_updated: 2026-04-28`. Contains the locked wedge sentence as a system rule, the 0–5 rubric, and hard constraints (vocab, LGA scope, trade scope, job size, commercial high-rise, personalisation).
- `rerank.user.md` — `version: 1.0.0`, templated with `saved_query_text`, `user_lga_slugs`, `thumbs_examples`, `candidates`.

Versioning rules:

1. Any change to either file MUST bump `version` (semver: PATCH for typo, MINOR for rubric tweak, MAJOR for prompt restructure).
2. The new `version` MUST pass the eval gate (A.4) before merging.
3. `prompt_version` is logged on every model call — when we extend the cost ledger to include it (V1.1), regression analysis becomes one SQL query.
4. The wedge sentence in the system prompt is locked. Any other change is allowed; that line is not.

### A.4 Eval pass criteria

Location: `evals/rerank/` (renamed from contract `eval/` to make room for future eval suites; the location is documented here and remains under the `eval/` umbrella per `contract.ai.eval_harness_path`).

- Gold dataset: `evals/rerank/dataset.jsonl` — 22 hand-authored cases covering bull's-eye matches (re-roof / Colorbond / membrane), false positives (solar PV on existing roof, new-build slab-with-roof), false-negative-risk abbreviations ("re roof", "reroof"), out-of-area (Wollongong), out-of-scope (commercial high-rise), low-value patch repairs.
- Config: `evals/rerank/promptfooconfig.yaml` — runs every case against both haiku-4-5 (primary) and sonnet-4-6 (fallback), asserting:
  - `score_within_1`: `|actual − expected| ≤ 1`
  - `reason_contains_keyword`: at least one expected keyword in `why`
  - `schema_valid`: numeric score 0–5, string `why` ≤ 140 chars, numeric confidence
- **Pass bar (launch gate):** ≥ 80% of cases pass `score_within_1` on haiku-4-5 BEFORE any prompt change ships.
- Promotion gate beyond MVP (per stack contract): scale to 500 labelled pairs and require precision ≥ 0.7 at recall ≥ 0.6 (`contract.ai.eval_launch_gate`). The 22-case gold set is the in-CI fast gate; the 500-pair set is the human-curated launch gate at end of week 4.
- CI wiring (handed to cicd phase): Buildkite step "AI Evals" runs `pnpm eval:rerank` only when `src/prompts/**` or `src/lib/ai/**` changes; build fails on any assertion regression.

### A.5 Cost-cap kill switch

Per wedge §6 ai-features constraint and `contract.ai.cost_tracking_impl`:

- **Per-user monthly ceiling:** AUD 0.50/month on AI inference (sum of embedding + rerank).
- **Weekly equivalent:** AUD 0.13. Sentry alert fires when any user's `weeklyCostAud(userId, weekStart) > 0.13`.
- **Degraded mode:** if a user has breached the ceiling, the next digest run skips the LLM rerank stage entirely and serves embedding-only cosine ranking. The digest header includes a banner: *"Note: this week's ranking ran in basic mode — your usage hit our cost ceiling. Reply or check the portal for details."*
- **Wiring:** backend-developer adds the gate at the top of `runRelevancePipeline` consumer in `src/modules/relevance/run.ts` — read `weeklyCostAud`, branch to embedding-only path if breached, set `digest.fallback_used = true`. Pipeline already supports the embedding-only path because stage 3 is the only LLM call.
- **Resume condition:** automatic at the next week boundary (Monday 00:00 AEST = new `week_start`).

### A.6 Files written by ai-features phase

| File | Purpose |
|------|---------|
| `src/lib/ai/cost-ledger.ts` | Typed wrapper around `AiCostLog`; `priceFor`, `recordAiCost`, `weekStartAEST`, `weeklyCostAud` |
| `src/lib/ai/embeddings.ts` | OpenAI `text-embedding-3-small` wrapper; `embed()`, `embedBatch()`, returns `number[]` length 1536 |
| `src/lib/ai/rerank.ts` | Anthropic rerank — haiku primary, sonnet fallback on `confidence < 0.5`; `rerankCandidates()` |
| `src/lib/ai/relevance-pipeline.ts` | Pure 3-stage orchestrator; DB access injected via `PipelineDeps` for testability |
| `src/prompts/rerank.system.md` | Versioned system prompt (`version: 1.0.0`); locked wedge rule, 0–5 rubric, hard constraints |
| `src/prompts/rerank.user.md` | Versioned templated user prompt |
| `evals/rerank/dataset.jsonl` | 22 hand-authored gold cases |
| `evals/rerank/promptfooconfig.yaml` | promptfoo config + assertions |
| `package.json` | Added `eval:rerank` script + `@anthropic-ai/sdk`, `openai`, `promptfoo` deps |

### A.7 Handoff to backend-developer

Backend-developer wires the pipeline in `src/modules/relevance/`:

1. Implement `PipelineDeps.ruleFilter` — SQL with GIN tsvector on `(description || raw_scope_text)`, joined to `lgas`, filtered to `lodgement_date >= now() - interval '7 days'`.
2. Implement `PipelineDeps.vectorRank` — first batch-embed any candidates without a `da_embeddings` row using `embedBatch(texts, { userId })`, upsert into `da_embeddings`, then run the cosine SQL from system-design §3.4 with `LIMIT 50`.
3. Implement `PipelineDeps.loadThumbsExamples` — top-5 `up` + top-5 `down` from `da_feedback` ordered by `created_at desc`. Activate only when count ≥ 200 (FR-025).
4. In `src/modules/relevance/run.ts`, before calling `runRelevancePipeline`:
   - Call `weeklyCostAud(userId, weekStartAEST())`.
   - If > AUD 0.13, skip rerank: call `vectorRank` only, return top-5 by cosine, set `digest.fallback_used = true`, append banner to digest.
5. In `src/modules/digest/cron.ts`, wrap each user iteration in try/catch — partial failure does not abort the run.
6. Set env vars in Vercel: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `USD_TO_AUD` (optional override).

ASSUMPTION (no schema change): the existing `Digest.fallbackUsed` boolean covers both the rate-limit fallback (sonnet rerank exhausted → embedding-only) and the cost-cap fallback. If we want to distinguish them in analytics, V1.1 can add a `fallback_reason` text column; today the boolean is sufficient for ops.

### A.8 Self-critique (gates from skill body)

- [x] Every model call goes through the cost ledger (`embed`/`embedBatch` and `rerankCandidates` both call `recordAiCost`)
- [x] Both prompts have `version` strings in frontmatter
- [x] `prisma/schema.prisma` already has `AiCostLog` and `users.savedQueryEmbedding vector(1536)` — no schema change made
- [x] No hardcoded model IDs outside `src/lib/ai/*` constants (PRIMARY_MODEL / FALLBACK_MODEL / EMBEDDING_MODEL); these reflect contract values verbatim
- [x] No `console.log` of prompts/responses with PII — only structured `console.error` for cost-ledger write failure
- [x] Vendor list matches contract — only `@anthropic-ai/sdk`, `openai`, `promptfoo` added
- [x] No live API calls during scaffolding — eval is `pnpm eval:rerank` invoked manually after secrets are set

*End of AI features section v1.0.*

---

## Email Templates

### Provider & Framework

- **Email Provider:** Resend (stack contract locked, 2026-Q2)
- **Template Engine:** React Email components (JSX-based, transpiles to HTML)
- **Client Library:** `src/lib/email/client.ts` — `sendEmail({to, template, props})` function
- **Retry Logic:** Idempotent, one retry on 5xx errors (Resend SDK handles rate limits)
- **Dev Mode:** No-op (console.log only) when `RESEND_API_KEY` is unset

### Template List

| Template | Purpose | Trigger | Data Props |
|---|---|---|---|
| `verify-email` | Email OTP verification (6-digit, 10-min expiry) | POST `/api/auth/signup`, POST `/api/auth/verify-email/resend` | `{ email, code }` |
| `password-reset` | Password reset link + code (1-hour expiry) | POST `/api/auth/password-reset/request` | `{ email, code, resetUrl }` |
| `weekly-digest` | Sunday 6 pm roofing DA list with feedback thumbs | Vercel Cron job, Sunday 17:00 AEST (backend-developer phase) | `{ weekStart, leadCount, lgas, cards[], precisionBadge?, smsEnabled }` |
| `digest-fallback-notice` | AI reranker degraded to keyword-only (cost-cap kill switch) | Backend cron (cost-cap ceiling exceeded) | `{ lgas, daCount }` |
| `welcome-after-verify` | Onboarding CTA: "Set your service area" | POST `/api/auth/verify` (after OTP success) | `{ firstName, lgaSetupUrl }` |

### Template Data Shape

#### `verify-email`
```typescript
{
  email: string;        // User email address
  code: string;         // 6-digit OTP code
}
```

#### `password-reset`
```typescript
{
  email: string;        // User email address
  code: string;         // Reset code (6-digit OTP or token)
  resetUrl: string;     // Full reset URL with signed token
}
```

#### `weekly-digest`
```typescript
{
  weekStart: string;                    // "27 Apr 2026"
  leadCount: number;                    // 5–15
  lgas: string[];                       // ["Western Sydney", "Hills"]
  cards: {
    id: string;
    address: string;                    // "12 Acacia Ave, Penrith NSW 2750"
    lga: string;
    value?: string;                     // "AUD 180k" or undefined
    why: string;                        // "Existing dwelling re-roof"
    scope: string;                      // ≤2 sentences
    applicant: string;
    relevanceScore: number;             // 0–10
    portalUrl: string;                  // Direct link to council DA portal
    thumbUpUrl: string;                 // /api/feedback?id=X&v=1&token=HMAC
    thumbDownUrl: string;               // /api/feedback?id=X&v=0&token=HMAC
  }[];
  precisionBadge?: {
    precision: number;                  // 93 (percent)
    weeks: number;                      // 4
  };
  smsEnabled: boolean;                  // Footer: "Reply STOP to opt out"
}
```

#### `digest-fallback-notice`
```typescript
{
  lgas: string[];                       // ["Western Sydney", "Hills"]
  daCount: number;                      // Total DAs found (below threshold)
}
```

#### `welcome-after-verify`
```typescript
{
  firstName: string;                    // "Eli"
  lgaSetupUrl: string;                  // "https://pi-au.example.com/onboarding/lga-select"
}
```

### Send-Call-Site Map

| Route / Handler | Triggers | Template | Props Source |
|---|---|---|---|
| `POST /api/auth/signup` | Account creation | `verify-email` | `email`, `otpCode` from DB |
| `POST /api/auth/verify-email/resend` | OTP resend request (rate-limited 1/min) | `verify-email` | `email`, `otpCode` from DB |
| `POST /api/auth/password-reset/request` | User requests password reset | `password-reset` | `email`, `resetCode`, computed `resetUrl` |
| `POST /api/auth/verify` (implied) | Email OTP verified successfully | `welcome-after-verify` | `firstName` from DB, computed `lgaSetupUrl` |
| Vercel Cron (Sunday 17:00 AEST) | Weekly digest generation (backend-developer phase) | `weekly-digest` | AI relevance pipeline output |
| Backend cost-cap kill switch | AI cost ceiling exceeded for week | `digest-fallback-notice` | Query LGAs, count failed DAs |

### Component Library (`src/emails/_components/`)

- **`Layout.tsx`** — Base HTML table structure, header, footer wrapper
- **`Button.tsx`** — Styled `<a>` element with primary/secondary variants (48px min height, email-safe inline CSS)
- **`LgaBadge.tsx`** — Amber pill badge for LGA names (4×8px padding, 12px font)
- **`Footer.tsx`** — Unsubscribe link, business address, SMS STOP notice, ABN placeholder

### Accessibility & Email Client Compatibility

- **iOS Mail (primary client per wedge):** Table-based layout (no CSS Grid), no JavaScript, 48×44px thumb links render as text/emoji with HMAC-signed `href` fallback
- **Gmail Mobile:** Same table layout, full HTML support
- **Dark mode:** Explicit `background-color` on all containers (email clients override CSS vars)
- **Fallback:** Plain text alt body (Resend renders automatically from template)

### Testing

**Run:** `pnpm test:emails`

Tests in `evals/emails/render-snapshots.test.ts`:
- Each template renders without error
- Subject line is not empty
- No `<script>` tags (email client security)
- Total bytes < 100KB (Outlook limit)
- All anchors use absolute URLs (no relative paths except `/api/...`)

### CAN-SPAM / SPAM Act 2003 Compliance

**Jurisdiction:** Australia (Primary) + all delivery regions

#### Mandatory Fields (per Australian Spam Act 2003)

1. **Sender Identification**
   - From: `ProjectIntelligence <noreply@resend.dev>` (Resend verified domain)
   - Reply-To: Support email (set by backend-developer)

2. **Physical Address (footer on all emails)**
   ```
   ProjectIntelligence AU Pty Ltd
   Level 1, 123 Business Street
   Sydney NSW 2000 AU
   ABN: XX XXX XXX XXX  [placeholder, ops fills in legal ABN]
   ```

3. **Unsubscribe / Opt-Out Mechanism**
   - **Transactional emails** (verify-email, password-reset): No unsubscribe required (security-critical)
   - **Marketing/digest emails** (weekly-digest): One-click unsubscribe via signed token URL + footer link
   - **SMS opt-out:** "Reply STOP to any SMS" (Twilio handles webhook → Postgres flag)

4. **Email Preferences Endpoint (future)**
   - `GET /api/auth/email-preferences` — read user's digest/marketing/notification prefs
   - `PUT /api/auth/email-preferences` — update frequency or opt-out
   - Unsubscribe URL pattern: `https://pi-au.example.com/unsubscribe?token=SIGNED_JWT`

#### Non-Compliance Risks

- **Sending without ABN:** Legal action by Australian Communications and Media Authority (ACMA)
- **No unsubscribe on digest:** Marketing compliance violation
- **SMS without opt-out:** SPAM Act §21 violation (even if user signed up)

**Owner:** Legal-compliance skill (phase 15, downstream)

### Development Workflow

#### Phase sequence

1. **Phase 6.8 (this phase):** Email templates + Resend client ✓
2. **Phase 6.9 (auth-engineer):** Wire templates into auth routes (signup, verify, password-reset) ✓
3. **Phase 7+ (backend-developer):** Digest generation cron, cost tracking
4. **Phase 15 (legal-compliance):** ABN, unsubscribe URLs, privacy policy links

#### Environment Variables

```bash
RESEND_API_KEY=re_...      # Resend API key (required for sending)
# If unset, email sending is a no-op (dev mode)
```

#### Dev Server Testing

1. Start dev server: `pnpm dev`
2. Create account via signup form → OTP sent to console (dev mode)
3. Check console logs: `[DEV] Email stub (RESEND_API_KEY not set)`
4. Once `RESEND_API_KEY` is set in `.env.local`, emails route to Resend

#### CI/CD Gates

**Gate:** Email templates render without errors and meet size / security constraints
```bash
pnpm test:emails
```

Must pass before landing any email-template changes.

### Open Issues & TODOs

| # | Issue | Owner | Timeline |
|---|---|---|---|
| 1 | SMS char-count validation for 3×160-char DA summaries | backend-developer | Phase 7 (digest cron) |
| 2 | HMAC signing for feedback tokens (`/api/feedback?id=X&v=1&token=...`) | backend-developer | Phase 7 |
| 3 | Unsubscribe token generation + validation endpoint | backend-developer | Phase 7 |
| 4 | "Quiet week" alternate email layout (< 5 DAs found) | backend-developer | Phase 7 |
| 5 | Cost-cap alert + fallback-notice trigger logic | backend-developer | Phase 7 |
| 6 | ABN placeholder → legal entity details | legal-compliance | Phase 15 |
| 7 | Privacy policy + Terms link in footer | legal-compliance | Phase 15 |
| 8 | Email preferences page (`/account/notifications`) | frontend-developer | Phase 9 |

*End of email templates section v1.0.*
