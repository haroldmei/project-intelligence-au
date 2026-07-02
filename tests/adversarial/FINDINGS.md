# Adversarial Findings — Phase 9 (adversarial-tester)

**Date:** 2026-04-28
**Test count:** 119 (114 passing, 5 failing — every failure is a real bug)
**Suite:** `pnpm test:adversarial` (vitest config: `vitest.adversarial.config.ts`)

The skill rule: **do not fix bugs found here.** Each entry below is handed to
the security-auditor (Phase 10) via `route-failure.sh` for routing back to
the responsible implementer.

## Severity legend

- **Critical** — auth bypass, privilege escalation, RCE, data loss, monetary loss
- **High** — defence-in-depth gap that becomes critical under one assumption
- **Med** — abuse vector that's costly but not catastrophic
- **Low** — hygiene / hardening / observability

---

## Findings table

| ID | Severity | Surface | Test | Repro | Owner |
|----|----------|---------|------|-------|-------|
| AT-001 | High | src/lib/auth/schemas.ts SignupSchema | tests/adversarial/auth-abuse.test.ts | Submit signup with `email = "a".repeat(10_000) + "@example.com"`. Zod's `.email()` validator passes. The 10KB email then hits `db.user.findUnique` and (if free) `argon2.hash` + `sendEmail`. **Fix:** add `.max(254)` to email schema (RFC 5321). | auth-engineer |
| AT-002 | Critical | src/lib/hmac/token.ts validateFeedbackToken | tests/adversarial/feedback-token.test.ts | Issue a token with `issuedAt = now + 100 years`. `age = now - issuedAt` is negative; `age > WINDOW_SECONDS` is false → token accepted. Future-dated tokens never expire. **Fix:** add `if (age < 0) return invalid` and a clock-skew guard `payload.issuedAt > now + 60`. | auth-engineer |
| AT-003 | High | src/lib/auth/rate-limit.ts checkRateLimit | tests/adversarial/auth-abuse.test.ts + property-based.test.ts | `checkRateLimit(key, 0, 60_000)` returns `{allowed:true}` on first call — new-window branch sets count=1 and returns allowed without comparing to limit. Any kill-switch limit=0 lets the first request through per key per window. **Fix:** in new-window branch, return `allowed: limit > 0`. | auth-engineer |
| AT-004 | Med | src/lib/auth/schemas.ts LoginSchema | tests/adversarial/auth-abuse.test.ts | `LoginSchema.password` is `z.string().min(1)` with no max. A 1MB password hands `argon2.verify` a huge candidate (~0.5s/hash). 100 concurrent submissions saturates Vercel serverless. **Fix:** `.max(128)` mirroring signup `passwordSchema`. | auth-engineer |
| AT-005 | Critical | src/modules/account/service.ts deleteAccount | tests/adversarial/account-deletion.test.ts | (1) `deleteAccount` does NOT cancel any Stripe subscription → erasure leaves orphaned customer billing AUD 199/mo. Privacy Act 2024 + Stripe ToS both require billing to stop. (2) Re-call after success throws Prisma "Record to delete does not exist" → DELETE /api/account 500s on retry. **Fix:** (a) call `cancelSubscriptionAtPeriodEnd` (or `del /v1/customers/{id}`) before user.delete; (b) catch P2025 to make idempotent. | auth-engineer + backend-developer |

---

## Documented gaps (passed tests — kept as regression sentinels)

These tests **pass** but the assertion encodes a gap the implementer may want
to close before launch tier:

- **G-001** [Med, rate-limit.ts] IPv4↔IPv6 not bucketed; attacker on /64 can rotate suffix to bypass per-IP cap. Mitigation at launch: normalize to /64 prefix.
- **G-002** [Med, rate-limit.ts] App trusts client `X-Forwarded-For` first hop without origin validation; spoofable under non-Vercel reverse-proxy.
- **G-003** [Low, feedback/route.ts] Feedback tokens are NOT replay-protected at the validator layer; replay only no-ops because `recordFeedback` is upsert. Add `feedback_token_replay` table at launch.
- **G-004** [Low, feedback/route.ts] Stealing both up/down email links for the same DA → upsert last-write-wins. Mitigation: include vote in URL path.
- **G-005** [Med, relevance/run.ts] ✅ **RESOLVED (issue #16).** No defence-in-depth against prompt-injection in DA descriptions reaching the LLM rerank. Fixed in `src/lib/ai/rerank.ts`: every untrusted field (`description`, `raw_scope_text`, `address`, `council`, the saved query, thumbs text) now passes through `sanitizeDaField` (caps length, collapses control chars, escapes the `<`/`>`/`&` delimiter tokens) and is wrapped in XML-style data tags; the system prompt (`rerank.system.base.md` → "Untrusted DA data (locked)") declares delimited content is data, never instructions. Response parsing hardened: non-JSON / missing-`results` replies no longer throw (batch → unscored), and scores outside 0–5 or rows for un-sent `da_id`s are dropped rather than clamped. Regression: `tests/adversarial/rerank-injection.test.ts` (delimiter break-out, oversized / control-char / JSON-breaking payloads, mocked-client schema conformance).
- **G-006** [Low, lib/sms/client.ts] ✅ **RESOLVED (issue #15).** `validateTwilioSignature` compared the computed HMAC-SHA1 against `X-Twilio-Signature` with `===`, which short-circuits on the first differing byte and leaks the shared-prefix length. Fixed in `src/lib/sms/client.ts`: the base64 signatures are now compared with `crypto.timingSafeEqual` over equal-length buffers (length pre-check guards the `RangeError` `timingSafeEqual` throws on unequal lengths), mirroring the Stripe webhook path (`src/modules/billing/stripe.ts`) and the HMAC token path (`src/lib/hmac/token.ts`). Regression: `__tests__/webhooks/twilio-signature.test.ts` (valid passes, tampered-equal-length fails, wrong-token fails, mismatched-length does not throw → false, different-URL replay fails).
- **G-007** [Med, webhooks/stripe/route.ts] ✅ **RESOLVED (issue #21).** No upper bound on `current_period_end`; 0 → access loss in 1970, huge value → year 33658. Fixed: `clampAccessUntil` (src/modules/billing/stripe.ts) pins `accessUntil` to `[now, now + 400d]` (annual prepay + margin) at both webhook write sites; a clamp logs + Sentry-warns. Regression: `__tests__/billing/stripe.test.ts` (far-future, past, missing/non-finite → clamped).
- **G-008** [Low, cost-ledger.ts priceFor] Accepts negative or NaN tokens → negative/NaN cost in ledger. Mitigation: `Math.max(0, …)` and reject NaN.
- **G-009** [Low, relevance-pipeline] Pipeline doesn't post-cap to `maxDigestSize`; trusts rerank. Mitigation: `results.slice(0, maxDigestSize)`.

---

## Severity summary

| Severity | Count |
|----------|-------|
| Critical | 2  (AT-002, AT-005) |
| High     | 2  (AT-001, AT-003) |
| Med      | 1  (AT-004) |
| **Active findings** | **5** |
| Documented gaps (regression sentinels) | 9 (G-001 … G-009) |

## Routing

Per build-product-v2 Phase 10 protocol, Critical/High items routed to
security-auditor via:

```bash
scripts/route-failure.sh --gate adversarial --area src/lib/auth/
scripts/route-failure.sh --gate adversarial --area src/lib/hmac/
scripts/route-failure.sh --gate adversarial --area src/modules/account/
```
