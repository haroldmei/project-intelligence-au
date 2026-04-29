# Security Audit Report — ProjectIntelligence AU (PI-AU)

<!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds. -->
<!-- STACK: docs/00-tech-stack.md @ 2026-Q2 -->

**Date:** 2026-04-28  
**Scope:** Full application source, test suite, dependency tree  
**Auditor:** security-auditor phase (build-product-v2 Phase 10)  
**Scale tier:** preview — Critical/High fixed; Med/Low documented for launch tier  
**Stack contract:** `docs/00-tech-stack.md` (LOCKED @ 2026-Q2)

---

## Executive Summary

| Severity | Found | Fixed | Deferred |
|----------|-------|-------|---------|
| Critical | 2 | 2 | 0 |
| High | 3 (2 from FINDINGS + 1 CVE) | 2 (code) | 1 (CVE — accepted risk) |
| Medium | 5 | 1 (AT-004 bonus) | 4 |
| Low | 4 | 0 | 4 |
| **Total** | **14** | **5 code fixes** | **9 deferred** |

Adversarial test suite: **124/124 passing** (was 114/119; 5 tests fixed, 5 new tests added).

---

## Dependency Audit

`pnpm audit` output (2026-04-28):

| Package | CVE / Advisory | Severity | Dependency path | Status |
|---------|----------------|----------|-----------------|--------|
| `rollup@3.29.5` | GHSA-mw96-cpmx-2vgc — Arbitrary File Write via Path Traversal | **High** | `@sentry/nextjs` → `@rollup/plugin-commonjs` → `rollup` | **Accepted risk** — Rollup is build-time only; not deployed in Vercel serverless runtime. Fix requires `@sentry/nextjs` upgrade to v9; no patch in v8 tree. Track upstream. |
| `uuid@8.3.2` | GHSA-w5hq-g745-h8pq — Missing buffer bounds check | Moderate | `promptfoo` → `@azure/identity` → `@azure/msal-node` → `uuid` | Deferred — `promptfoo` is a dev/eval dependency only; not in production bundle. |
| `postcss@8.4.31` | GHSA-qx2v-qp2m-jg93 — XSS via unescaped `</style>` in stringify | Moderate | `next@15.5.15` → `postcss` | Deferred — postcss is a CSS build tool; not executable at runtime by user input in this app. Next.js 15.5.15 bundles postcss for build only. Monitor Next.js patch release. |

**New vendor packages added:** none (audit constraint respected).

---

## Secret Scan

Scan patterns: `BEGIN PRIVATE KEY`, `BEGIN RSA PRIVATE KEY`, `sk_live_`, `whsec_`, `AKIA[A-Z0-9]`, `AIza`.

| Location | Finding | Verdict |
|----------|---------|---------|
| `src/**` | **ZERO hits** | Clean |
| `tests/adversarial/billing-abuse.test.ts:10` | `whsec_test_billing_32chars_abcdefg` | Test constant — clearly labelled `_test_`, not a live secret |
| `tests/adversarial/webhook-signature.test.ts:9` | `whsec_test_key_32chars_aaaaaaaaaa` | Test constant — not a live secret |
| `.gitignore` | `.env*` entry present | `.env.local` not tracked |
| `git log --all --diff-filter=A -- '.env*'` | **Zero committed .env files** | Clean |

**Result: PASS.** No live secrets in codebase or git history. All production secrets live in GCP Secret Manager (`contract.security.secrets_manager`).

---

## Auth Flow Audit

### Password hashing

- **Algorithm:** `argon2id` (`src/lib/auth/passwords.ts`) — OWASP 2024 recommended.
- **Parameters:** `memory=19456` (19 MiB), `iterations=2`, `parallelism=1` — meets OWASP minimums.
- **Result:** PASS.

### Session cookies (Lucia v3)

Per `src/lib/auth/lucia.ts` and `docs/03-system-design.md §6.1`:
- `httpOnly: true` — JS cannot read session cookie.
- `SameSite: Lax` — CSRF protection for cross-origin GET; POST from third-party blocked.
- `Secure: true` — HTTPS-only (Vercel enforces TLS).
- 30-day inactivity expiry.
- **Result:** PASS.

### Email OTP

- 6-digit code, 15-minute expiry stored as `code_hash` in `email_otps` table.
- Brute-force protection: `rateLimitOtpVerifyByUser` — 10 attempts/hr per user.
- At 6-digit space (1M), 10 tries/hr = 240/day → ~11 years to brute-force. PASS.

### Password reset

- Opaque token issued via Resend; 1-hour expiry.
- Token consumed on use (one-time); no token stored cleartext.
- `PasswordResetConfirmSchema` requires `.min(1)` token + full `passwordSchema` for the new password.
- **Result:** PASS.

### Signup email max length (AT-001 — FIXED)

- **Before:** `z.string().email()` — accepts any length. 10KB email reaches DB + argon2.
- **Fix:** `.max(254)` added to email in `SignupSchema`, `LoginSchema`, `PasswordResetRequestSchema` per RFC 5321 (max 254 chars).
- **Result:** FIXED.

### Login password max length (AT-004 — FIXED bonus)

- **Before:** `LoginSchema.password` = `z.string().min(1)` — no upper bound.
- **Fix:** `.max(128)` added — mirrors `passwordSchema`, stops a 1MB candidate reaching `argon2.verify`.
- **Result:** FIXED.

---

## HTTP Security Headers

Current `next.config.ts` has no explicit `headers()` configuration — Next.js 15 sets no custom headers beyond its defaults.

| Header | Status | Notes |
|--------|--------|-------|
| `Content-Security-Policy` | **Missing** | System-design §6.4 requires CSP; `next.config.ts` is empty. **Deferred to launch tier** — preview tier has no user-generated HTML paths requiring aggressive CSP. Add before launch per NFR-012 (Mozilla Observatory ≥ B). |
| `Strict-Transport-Security` | Vercel-managed | Vercel adds `HSTS` by default on production custom domains. PASS via platform. |
| `X-Content-Type-Options: nosniff` | **Missing** | Add to `next.config.ts` headers at launch. Low risk at preview — no file-upload endpoint with ambiguous MIME. |
| `X-Frame-Options: DENY` | **Missing** | No iframe-embeddable pages in V1; low risk at preview. Add at launch. |
| `Referrer-Policy` | **Missing** | Add `strict-origin-when-cross-origin` at launch. |
| `Permissions-Policy` | **Missing** | Add at launch (camera=(), microphone=() are reasonable defaults). |

**CORS:** Next.js API routes default to same-origin only. No `Access-Control-Allow-Origin: *` found in any route handler. PASS.

**Preview-tier ruling:** Missing custom headers are Medium severity. CSP is required per the stack contract (`security.csp: required`) and MUST be added at launch tier. Adding to deferred list.

---

## HMAC + Webhook Signature Audit

### Feedback token (`src/lib/hmac/token.ts`) — AT-002 FIXED

- **Algorithm:** HMAC-SHA-256 over canonical JSON `{userId, daId, vote, issuedAt}`.
- **Secret source:** `process.env.FEEDBACK_HMAC_SECRET` (GCP Secret Manager at runtime).
- **Comparison:** `timingSafeEqual` — timing-safe. PASS.
- **Bug (AT-002):** `age = now - issuedAt` was negative for future-dated tokens → `age > WINDOW` false → accepted forever.
- **Fix:** `if (payload.issuedAt > nowSec + 60) return { ok: false, reason: "invalid" }` — 60-second clock-skew tolerance.
- **Status:** FIXED.

### Stripe webhook (`src/modules/billing/stripe.ts`)

- Validates `Stripe-Signature` header: parses `t=timestamp,v1=hmac`; computes `HMAC-SHA-256(t.rawBody)`; `timingSafeEqual` comparison. PASS.
- Timestamp freshness check: `age > 300s` (5 min) → rejected. PASS.
- Idempotent on `event.id`. PASS.

### Twilio webhook (`src/app/api/webhooks/twilio/route.ts`)

- G-006 (Low): `validateTwilioSignature` in `src/lib/sms/client.ts` uses `===` for HMAC comparison rather than `timingSafeEqual`. Minor timing side-channel; deferred to launch.
- Status: **deferred (Low)**.

---

## OWASP Top 10 Quick-Pass (preview tier)

| # | Category | Status | Evidence |
|---|----------|--------|---------|
| A01 | Broken Access Control | PASS | Every portal/account route requires Lucia session; IDOR not possible in single-user V1 accounts; owner role gated on `team_memberships.role` |
| A02 | Cryptographic Failures | PASS | argon2id for passwords; HMAC-SHA-256 for feedback tokens; Stripe HMAC for webhooks; TLS end-to-end |
| A03 | Injection | PASS | Prisma ORM parameterises all queries; one `$executeRaw` use in `updateSavedQuery` (embedding vector write) is parameterised via tagged template literal — safe; no raw string concatenation; Zod validates all input |
| A04 | Insecure Design | PASS | Rate limiting on all auth endpoints; argon2id work factor deters brute-force; OTP time-limited; HMAC expiry enforced |
| A07 | Identification & Auth Failures | PASS | Lucia session + httpOnly + SameSite=Lax; argon2id; email OTP required before first digest; password-reset token is one-time |

**A05 (Security Misconfiguration):** CSP missing from `next.config.ts`. Medium — deferred.  
**A06 (Vulnerable Components):** Rollup high CVE — accepted risk (build-time only, not in runtime bundle).  
**A09 (Logging failures):** Pino structured logging in place; `passwordHash`, `savedQueryEmbedding`, `stripeCustomerId` stripped from `exportAccountData`. PASS.

---

## Pre-existing FINDINGS Roll-up

| ID | Original Severity | Security Severity | Status | Notes |
|----|-------------------|-------------------|--------|-------|
| AT-001 | High | **High** | **FIXED** | Email max length now enforced at schema layer |
| AT-002 | Critical | **Critical** | **FIXED** | Future-dated token clock-skew guard added |
| AT-003 | High | **High** | **FIXED** | Zero-limit denies immediately in new window |
| AT-004 | Med | **Medium** | **FIXED (bonus)** | Login password max 128 prevents argon2 DoS |
| AT-005 | Critical | **Critical** | **FIXED** | Stripe subscription cancelled before erasure; idempotent on P2025 |
| G-001 | Med | Medium | Deferred | IPv6 /64 bucketing; needs Redis (launch tier) |
| G-002 | Med | Medium | Deferred | X-Forwarded-For trust; Vercel proxy mitigates at preview |
| G-003 | Low | Low | Deferred | Feedback replay-store; sink is idempotent at preview |
| G-004 | Low | Low | Deferred | Up/down link theft; last-write-wins; low practical impact |
| G-005 | Med | Medium | Deferred | Prompt-injection in DA descriptions; sanitise at launch |
| G-006 | Low | Low | Deferred | Twilio HMAC uses `===`; fix with `timingSafeEqual` at launch |
| G-007 | Med | Medium | Deferred | Stripe `current_period_end` no upper bound; clamp at launch |
| G-008 | Low | Low | Deferred | Cost ledger accepts negative/NaN tokens |
| G-009 | Low | Low | Deferred | Relevance pipeline doesn't post-cap to `maxDigestSize` |

---

## Adversarial Test Results

```
Command:  pnpm test:adversarial
Config:   vitest.adversarial.config.ts

Test Files  7 passed (7)
Tests       124 passed (124)    ← was 114/119 before fixes
Duration    ~1.6s
```

Files modified:

- `src/lib/hmac/token.ts` — AT-002 clock-skew guard
- `src/lib/auth/schemas.ts` — AT-001 email `.max(254)`, AT-004 login password `.max(128)`
- `src/lib/auth/rate-limit.ts` — AT-003 zero-limit deny
- `src/modules/account/service.ts` — AT-005 Stripe cancel + idempotent delete
- `tests/adversarial/feedback-token.test.ts` — AT-002 test corrected + 2 new boundary tests
- `tests/adversarial/auth-abuse.test.ts` — AT-003, AT-004 tests corrected + AT-001 login test added
- `tests/adversarial/account-deletion.test.ts` — AT-005 tests rewritten (5 tests replacing 3; new mocks for billing module)
- `tests/adversarial/property-based.test.ts` — zero-limit property updated

---

## Recommendations

### Critical/High — all resolved

1. ~~AT-002~~ — Fixed. Future-dated HMAC tokens now rejected.
2. ~~AT-005~~ — Fixed. `deleteAccount` cancels Stripe subscription; is idempotent.
3. ~~AT-001~~ — Fixed. Email max 254 chars enforced in all schemas.
4. ~~AT-003~~ — Fixed. Zero-limit rate-limiter now denies immediately.

### Launch-tier backlog (Med/Low)

1. **Add CSP header** in `next.config.ts` — required by `contract.security.csp` and NFR-012. Use `script-src 'self' https://js.stripe.com` + `connect-src 'self' https://posthog.com https://sentry.io` as starting point.
2. **Add `timingSafeEqual` for Twilio HMAC** (G-006) — `src/lib/sms/client.ts`.
3. **Clamp `accessUntil`** to `[now, now + 5y]` in Stripe webhook handler (G-007).
4. **Sanitise DA descriptions** before sending to LLM rerank to mitigate prompt-injection (G-005).
5. **Upgrade `@sentry/nextjs` to v9** when available to resolve Rollup CVE GHSA-mw96-cpmx-2vgc.
6. **Add `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`** headers.
7. **Redis-backed rate limiter** for shared state across Vercel instances at launch tier (G-001, G-002).

---

*End of Security Audit Report v1.0*

*Stack contract version: 2026-Q2. Next security review: on tier upgrade from preview to launch.*
