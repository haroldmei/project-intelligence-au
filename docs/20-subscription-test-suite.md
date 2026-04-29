# Subscription lifecycle test suite

End-to-end coverage of every state transition a paying user can go through, from "just signed up" to "cancelled and resubscribed." Runs in ~2.5s, no real Stripe calls, no email step.

**File:** `__tests__/billing/lifecycle.test.ts`
**Framework:** Vitest 4 (`vitest.backend.config.ts`)
**Runtime:** Node + a real Postgres test DB

---

## How to run

```bash
DATABASE_URL=postgres://… \
  pnpm exec vitest run -c vitest.backend.config.ts __tests__/billing/lifecycle.test.ts
```

Or watch mode:

```bash
DATABASE_URL=… pnpm exec vitest -c vitest.backend.config.ts __tests__/billing/lifecycle.test.ts
```

`DATABASE_URL` should point to the **dev or test** DB — never production. The suite runs `TRUNCATE … CASCADE` between tests via `__tests__/setup-test-db.ts`.

If you want a fully isolated test database, set `TEST_DATABASE_URL` instead — the helper picks it up first.

### Make sure the schema is current

The suite relies on the `billing_state` migration (`users.plan`, `users.cancel_at_period_end`, `stripe_webhook_events`). Apply it once with:

```bash
DATABASE_URL=… pnpm exec prisma migrate deploy
```

---

## What's mocked, what's real

| Layer | Strategy |
|---|---|
| Postgres | **Real** — every assertion reads back actual rows |
| Stripe HTTP (customer create, checkout session, portal, list/cancel sub) | **Mocked** with `vi.mock('@/modules/billing/stripe', …)` keeping the pure helpers (`validateStripeWebhook`, `planFromPriceId`) real |
| Webhook signature validation | **Real** — the suite signs synthetic events with a test `whsec_` so HMAC + timestamp checks run end-to-end |
| Lucia session | **Mocked** — `validateRequest` is stubbed per test; users are seeded with `emailVerified: true` so no OTP step runs |
| Email | **No-op** (RESEND_API_KEY is empty) |

This means the suite covers: Prisma queries, route-handler logic, webhook signature/idempotency, status state machine, the `withTrial` decision, and the `plan` capture from price IDs. It does **not** cover Stripe's own behavior or the live network.

---

## Lifecycle paths covered

### Stage 1 — pre-Checkout (just signed up)
The DB starts in this shape: `subscriptionStatus="trial"`, no `stripeCustomerId`, `accessUntil=null`. The UI uses `accessUntil` (not `subscriptionStatus`) as the "is there a real Stripe sub?" signal.

- ✅ Seeded user shape is correct
- ✅ `GET /api/account/me` returns trial-no-Stripe DTO
- ✅ `DELETE /api/billing/subscription` with no customer → **404** (regression guard for the bug we shipped earlier this week)
- ✅ `DELETE /api/billing/subscription` unauthed → **401**

### Stage 2 — checkout creation
- ✅ First-time checkout creates a Stripe customer, caches `stripeCustomerId`, calls `createCheckoutSession` with `withTrial=true`
- ✅ A user previously in `cancelled` state goes through with `withTrial=false` (no second free trial)
- ✅ Unauthed → **401**

### Stage 3 — `customer.subscription.created` (trial begins on Stripe)
- ✅ Populates `plan` (from `items[0].price.id`), `accessUntil`, `cancelAtPeriodEnd=false`, `subscriptionStatus="trial"`
- ✅ **Idempotency:** delivering the same event ID twice is a no-op (the `stripe_webhook_events` row blocks re-processing — caught a real `P2002` detection bug while writing this test)
- ✅ Webhook for an unknown customer is acked with **200** but writes nothing
- ✅ Invalid signature → **400**, no DB write
- ✅ Missing signature header → **400**

### Stage 4 — cancel mid-trial
- ✅ `DELETE /api/billing/subscription` returns `{ ok: true, accessUntil }`
- ✅ The follow-up `customer.subscription.updated` event with `cancel_at_period_end=true` persists `cancelAtPeriodEnd=true` while keeping `subscriptionStatus="trial"` — this is what the UI uses to show "Cancellation scheduled"

### Stage 5 — trial converts to paid
- ✅ `customer.subscription.updated` with `status=active` flips `subscriptionStatus` from `trial` to `active` and bumps `accessUntil` to the next period end

### Stage 6 — payment failure & recovery (dunning)
- ✅ `invoice.payment_failed` → `subscriptionStatus="past_due"`
- ✅ `invoice.payment_succeeded` while `past_due` → back to `active`, `accessUntil` bumped from the invoice line items
- ✅ `invoice.payment_succeeded` while already `active` → no state change (regression guard against double-applying renewal events)

### Stage 7 — final cancellation
- ✅ `customer.subscription.deleted` sets `subscriptionStatus="cancelled"` and clears `cancelAtPeriodEnd`

### Stage 8 — resubscribe
- ✅ Cancelled user calls checkout → existing `stripeCustomerId` is reused, `withTrial=false`
- ✅ Subsequent `customer.subscription.created` restores `subscriptionStatus="active"` and `accessUntil`

### Stage 9 — defensive status mapping
- ✅ Unknown Stripe status (`incomplete`, `incomplete_expired`, future additions) preserves the existing DB status — does **not** silently downgrade an active user to `trial`

### Stage 10 — billing portal
- ✅ Returns a portal URL when `stripeCustomerId` exists
- ✅ Returns **404** when the user has no Stripe customer yet

---

## Why this design

**Email verification bypassed.** Users are inserted via Prisma with `emailVerified: true` and `passwordHash: "hashed"`. There is no signup-via-route step, no OTP, no email. This makes every test deterministic and ~100ms to set up.

**No Stripe network calls.** The HTTP-calling helpers in `@/modules/billing/stripe` are replaced by `vi.fn()`s that return stub URLs and capture call args. Webhook signature/dedupe/state-machine logic still runs against the real route handler, since that's where the bugs hide.

**Each test re-truncates.** The `beforeEach` hook does `TRUNCATE … RESTART IDENTITY CASCADE` and re-seeds the LGA bundle reference data. Tests can run in any order.

**Routes invoked directly.** No HTTP server. We `import { POST } from "@/app/api/.../route"` and call with a synthetic `Request`. This is faster than spinning up Next dev and exercises the same code path Vercel runs.

---

## Bugs caught while writing the suite

1. **Webhook idempotency was broken** — `isUniqueViolation` was checking `err.message.includes("P2002")` but Prisma exposes the code on `err.code`, not in the message string. Without this fix, every duplicate Stripe delivery would 500, and Stripe would retry indefinitely. **Fixed in the same commit.**

---

## Future additions (not in scope this round)

- **Out-of-order delivery:** simulate `event.created` timestamps and assert that an older event arriving after a newer one doesn't roll state backward. The current dedupe row prevents *exact* re-delivery but not version skew.
- **Real Stripe end-to-end:** Playwright spec that drives the actual Stripe Checkout test page with `4242 4242 4242 4242`, then asserts via `/api/account/me` that the webhook landed. Slow (~30s/test), only run pre-launch.
- **Team-plan multi-seat:** when `team-membership` UI exists, add coverage for invite-flow + per-seat counters.
- **Invoice metadata:** assertions on tax/GST line items (NFR-029) once we capture invoice IDs.
