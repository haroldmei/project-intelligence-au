# Subscription lifecycle — deployed E2E suite

Drives a **live deployment** end-to-end through every state a paying user can land in. Real Stripe Checkout (test mode), real webhooks, real Postgres. No real email — signup auto-verifies for `@e2e.test.pi-au.com`. ~3.6 min for the full suite.

**Spec:** `e2e/billing-lifecycle-prod.spec.ts`
**Config:** `playwright.prod.config.ts`
**Counterpart:** unit-level coverage of the same state machine lives in `__tests__/billing/lifecycle.test.ts` (`docs/20-subscription-test-suite.md`)

The suite is **safe by default for staging** — pointed at `staging.pi-au.com` with test-mode Stripe. Running against production is gated to "prod still in test mode" (typically pre-launch) and refuses if it sees `sk_live_` keys.

---

## How to run

### Against staging (the normal case)

```bash
pnpm test:billing:staging
```

That's it. The wrapper auto-loads `.env.staging.local`, which provides:
- `NEXT_PUBLIC_APP_URL=https://staging.pi-au.com` → tests' `baseURL`
- `STRIPE_SECRET_KEY=sk_test_...` → falls back to `STRIPE_TEST_SECRET_KEY` in the spec

The suite **refuses to run** unless the Stripe key starts with `sk_test_`, so you can't torch live customer data even if `.env.staging.local` was misconfigured.

### Against production (rare, pre-launch only)

```bash
pnpm test:billing:prod
```

Auto-loads `.env.production.local`. Same `sk_test_` guard applies. **After you flip prod to live mode (`sk_live_`), this script auto-skips every test** — you can't accidentally run the E2E against real customers.

### Single test

```bash
bash scripts/with-env.sh .env.staging.local pnpm exec playwright test -c playwright.prod.config.ts --grep "Stage 3"
```

### Headed (watch the browser)

```bash
bash scripts/with-env.sh .env.staging.local pnpm exec playwright test -c playwright.prod.config.ts --headed
```

### Override URL (preview deployments, custom URLs)

```bash
PROD_BASE_URL=https://project-intelligence-abc123.vercel.app pnpm test:billing:staging
```

`PROD_BASE_URL` wins over the `NEXT_PUBLIC_APP_URL` from the env file.

Failure artifacts (screenshot, trace, page snapshot) land in `test-results-prod/`. Open a trace with `pnpm exec playwright show-trace test-results-prod/<dir>/trace.zip`.

---

## Pre-flight: production must be in test mode

This suite hits the **live `pi-au.com`** but expects everything to be in **Stripe test mode**:

- `STRIPE_SECRET_KEY` on Vercel = `sk_test_...`
- `STRIPE_PRICE_ID_SOLO` / `_TEAM` = test-mode price IDs
- `STRIPE_WEBHOOK_SECRET` = test-mode webhook's signing secret (live and test webhooks have **different** secrets)
- The webhook endpoint in Stripe dashboard (test mode) points to `https://www.pi-au.com/api/webhooks/stripe`

If the webhook secret is a live one but Stripe is firing test events (or vice versa), every webhook delivery 400s with `invalid signature`. Symptom in the suite: Stage 3 hangs in `pollUntilAccessUntilSet` because `accessUntil` never populates. Verify in Stripe Dashboard → Developers → Webhooks → Recent deliveries.

A loud `[env] STRIPE in TEST MODE on a production deploy …` warning prints on every cold start so test-mode credentials can't quietly survive into a real launch.

---

## How email verification is bypassed

The signup route at `src/app/api/auth/signup/route.ts` auto-sets `emailVerified: true` and skips the OTP email when **both** of these are true:

1. `STRIPE_SECRET_KEY` starts with `sk_test_`
2. The signup email matches `@e2e.test.pi-au.com` (the `.test` reserved-TLD subdomain we own)

The signup response includes `nextStep: "/onboarding/area"` so the client skips `/verify` entirely. Flip Stripe to live mode and the bypass turns itself off — there is no flag to remember.

---

## What's real vs simulated

| Layer | Strategy |
|---|---|
| Frontend (signup → onboarding → /plan → /account) | **Real**, Playwright drives the live UI |
| Stripe Checkout | **Real**, test mode, card `4242 4242 4242 4242` |
| Stripe webhooks (subscription.created / updated / deleted, invoice.*) | **Real**, signed by Stripe, validated by our handler |
| Postgres | **Real** — production DB, but every test cleans up via `/api/account/delete` |
| Email | **Skipped** by the auto-verify bypass |
| Subscription cancellation (Stage 6+7) | Forced via Stripe REST API instead of waiting 14 days for the trial to expire |

---

## Lifecycle paths covered

### Stage 1 — signup auto-verifies and skips `/verify`
Drives `POST /api/auth/signup` with an `@e2e.test.pi-au.com` address, asserts the user lands directly on `/onboarding/area`, and reads back from `GET /api/account/me`:

- `email` = the signup email
- `emailVerified` = `true`
- `subscriptionStatus` = `"trial"`
- `accessUntil` = `null`
- `cancelAtPeriodEnd` = `false`

### Stage 2 — pre-Checkout `/account` UI
With a fresh signup but no Checkout, asserts the page shows:

- A **"Choose a plan"** link
- **No** "Cancel subscription" button
- **No** "Manage billing" button

This is the regression guard for the bug where pre-Checkout users saw a Cancel button that 404'd against `/api/billing/subscription`.

### Stage 3 — full Checkout → trial-active
Walks signup → onboarding → `/plan` → picks Solo → Stripe Checkout → fills test card `4242 4242 4242 4242` → submits → returns to `/account`. Polls `/api/account/me` for the subscription.created webhook to land, then asserts:

- `subscriptionStatus` = `"trial"`
- `cancelAtPeriodEnd` = `false`
- `plan` = `"solo"` (extracted from `items[0].price.id` by `planFromPriceId`)
- `accessUntil` is set (~14 days out)
- The page shows **"Trial ends [date]"**, with **Cancel** and **Manage billing** buttons visible

### Stage 4 — cancel during trial → pending-cancellation
Continuing from a Stage-3-style trial, clicks **Cancel subscription**, confirms in the dialog, polls until the `customer.subscription.updated` webhook persists `cancelAtPeriodEnd=true`, then asserts the page now shows **"Cancellation scheduled. You're good until …"** and the Cancel button is **gone**.

### Stage 5 — Manage billing → Stripe portal
Hits `POST /api/billing/portal` directly to capture the redirect URL (the click race is too tight to read response bodies after `window.location` fires), asserts it contains `billing.stripe.com`, then verifies the click navigates the page off our domain.

### Stage 6 — final cancellation → Resubscribe button
Sets up a trial, then uses the Stripe REST API to **immediately delete** the subscription (no period-end wait). Polls until the `customer.subscription.deleted` webhook lands and the DB shows `subscriptionStatus="cancelled"`. Asserts the page shows **"Subscription cancelled"** with a **Resubscribe** button.

### Stage 7 — resubscribe (no trial second time)
Continues from Stage 6's cancelled state, clicks **Resubscribe**, completes a second Stripe Checkout, and verifies the new subscription went through with `withTrial=false`:

- `subscriptionStatus` flips straight to `"active"` (skipping the trial state) — exactly what we want, since the user already had their 14 days.

---

## Cleanup

Every test ends with `tryDeleteAccount(page)`, which calls `DELETE /api/account/delete`. The handler cancels any active Stripe subscription before deleting the user row. So the production DB and Stripe test-mode customer list stay tidy across runs.

Failed tests still leave their user behind. To bulk-clean orphaned test users, run a one-shot SQL like:

```sql
DELETE FROM users WHERE email LIKE '%@e2e.test.pi-au.com';
```

---

## Test selectors — what proved fragile

Stripe's hosted Checkout UI changes faster than its API. Lessons from the iteration loop:

- **Card form is collapsed by default** when Link is the suggested payment method. The `radio "Card"` element exists but the `cc-number` input does not until the radio's wrapping `<label>` is clicked. `radio.click({ force: true })` doesn't trigger the React handler — clicking the label does.
- **`autocomplete="cc-number" / cc-exp / cc-csc / cc-name / postal-code"`** are the most stable input selectors across Stripe revs.
- **Submit button is `data-testid="hosted-payment-submit-button"`** regardless of whether it reads "Subscribe" or "Start trial".
- **"Save my information for faster checkout"** must be unchecked, otherwise Stripe demands a phone number for Link signup.
- **Submit click is occasionally dropped** when Stripe briefly disables and re-enables the button during validation. The helper now retries the click if the button is still enabled 2s later.

---

## Bugs caught while writing this suite

1. **Webhook URL was on apex (`pi-au.com`) instead of `www.pi-au.com`** — Stripe was firing events to the apex, which 307-redirected to www but the webhook handler didn't follow redirects, so signature validation failed. Fixed by updating the destination in Stripe dashboard.
2. **`role="alertdialog"` mismatch** — the `AlertDialog` component renders as `role="dialog"`. The pre-existing `e2e/cancel-subscription.spec.ts` had the same wrong locator; the new spec uses `getByRole("dialog", { name: /cancel your subscription/i })`.
3. **`/account` showed a "Cancel" button for users who hadn't started Checkout** — Stage 2 catches this. The fix gates Cancel on `accessUntil != null`.

---

## Future additions (not in scope this round)

- **Past_due dunning flow** — needs Stripe **test clocks** to fast-forward past trial end without waiting 14 days. Covered in the unit suite (`__tests__/billing/lifecycle.test.ts` Stage 6).
- **Idempotency / out-of-order webhook delivery** — same: covered in unit suite, hard to provoke from the frontend.
- **3DS / SCA challenge** — once we accept European cards, add `4000 0027 6000 3184` as a test scenario and drive the challenge iframe.
- **Mobile viewport** — currently `Desktop Chrome`; add a `Pixel 5 / iOS Mail` project for parity with the wedge user.
