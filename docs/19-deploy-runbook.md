# Deploy Runbook — Month 1 Ship-and-Sell

**Audience:** you, doing the first prod deploy of PI-AU.
**Pairs with:** `scripts/deploy.sh` (the automated parts)
**Goal:** a Vercel-hosted production URL serving the landing page and accepting signups.

This runbook covers only what `scripts/deploy.sh` *cannot* automate — third-party
account bootstrap, DNS, secret generation, dashboard one-offs.

---

## One-time setup (Day 1)

### 1. Vercel project + Postgres

```bash
scripts/deploy.sh preflight   # check CLIs are installed
scripts/deploy.sh init-env    # creates .env.production.local from template
```

Then in the Vercel dashboard:

1. Visit https://vercel.com/new and import `haroldmei/project-intelligence-au`.
2. **Don't deploy yet** — open the project settings.
3. Storage → Create → Postgres. Choose region `syd1` (Sydney).
4. Wait for provisioning (~30s). Vercel auto-attaches `DATABASE_URL`,
   `POSTGRES_*` to the project's production env.

### 2. Resend domain (sender)

1. https://resend.com → Domains → Add Domain. Enter your sending domain
   (e.g. `mail.pi-au.com`).
2. Resend shows 3 DNS records (SPF, DKIM, DMARC). Add them at your registrar.
3. Wait for verification (5–60 min). Status must be "Verified" before deploy
   or transactional emails will silently fail in production.
4. Resend → API Keys → create production key. Paste into
   `.env.production.local` as `RESEND_API_KEY`.
5. Update `src/lib/email/client.ts` "from" address if it differs from the
   default — confirm the from-domain matches what Resend verified.

### 3. Stripe live mode

1. https://dashboard.stripe.com → toggle to Live mode (top-left).
2. Settings → API Keys → reveal `sk_live_...`. Paste as `STRIPE_SECRET_KEY`.
3. Products → Create:
   - **Solo** — recurring, AUD $99/month, **tax behaviour: inclusive** (GST is
     built into the $99; see `src/lib/pricing.ts`, the single source of truth,
     and docs/16-pricing.md) → copy `price_...` to `STRIPE_PRICE_ID_SOLO`.
   - **Team** — *deferred*: do not create until the multi-seat flow ships.
     `STRIPE_PRICE_ID_TEAM` stays unset in live mode for now.
4. Webhooks → Add endpoint:
   - URL: `https://<your-vercel-domain>/api/webhooks/stripe`
   - Events: `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.payment_succeeded`,
     `invoice.payment_failed`, `customer.subscription.trial_will_end`
   - Save → reveal `whsec_...` → paste as `STRIPE_WEBHOOK_SECRET`.

### 4. Sentry

1. https://sentry.io → Create Project → Next.js platform → name: `pi-au`.
2. Copy the DSN. Paste into both `SENTRY_DSN` (server) and
   `NEXT_PUBLIC_SENTRY_DSN` (client).
3. Optional: install `@sentry/wizard` later for source-map upload during builds.
   Not required for first deploy.

### 5. PostHog (optional Month 1, recommended)

1. https://app.posthog.com → Create project → name: `pi-au`.
2. Project settings → copy "Project API key" → `NEXT_PUBLIC_POSTHOG_KEY`.
3. `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com` (default; the ingest
   host, distinct from the `app.posthog.com` dashboard URL above).
4. Cookie consent is wired in `src/components/cookie-consent.tsx` — events
   only fire after the user accepts the banner.

### 6. Generate the two server-side secrets

```bash
echo "FEEDBACK_HMAC_SECRET=$(openssl rand -base64 32)" >> .env.production.local
echo "CRON_SECRET=$(openssl rand -base64 32)" >> .env.production.local
```

(Don't reuse these between environments.)

### 7. Support inbox (Month 1: minimum viable)

Cheapest workable option: a Gmail filter on `support@pi-au.com` (alias to
your inbox) with a saved label. Pre-write three canned responses (refund,
how-to-pause, "where's my digest"). Upgrade to Front/Help Scout when
volume > 5 tickets/wk.

---

## First deploy

```bash
scripts/deploy.sh preflight   # ensure all required env vars are filled
scripts/deploy.sh link        # vercel link (interactive — pick the project)
scripts/deploy.sh env-up      # bulk push env vars to Vercel
scripts/deploy.sh deploy      # vercel deploy --prod
# wait ~60–90s for Vercel build
scripts/deploy.sh smoke       # curl test the prod URL
```

The `vercel-build` script (in `package.json`) runs on Vercel:
`prisma generate && prisma migrate deploy && prisma db seed && tsx scripts/dev-seed.ts && next build`

- `migrate deploy` — applies migrations against Vercel Postgres
- `prisma db seed` — inserts the 4 bundles + 15 LGAs (idempotent)
- `dev-seed.ts` — **skipped on production deploys** (gated on `VERCEL_ENV`);
  runs on preview deploys to give them demo data

After the first successful deploy, copy the Vercel-assigned URL into
`NEXT_PUBLIC_APP_URL` in `.env.production.local`, then re-run
`env-up` and `deploy` so the app knows its own canonical URL.

---

## Subsequent deploys

```bash
git push          # CI is GitHub-based; pushing to main triggers Vercel
# or
scripts/deploy.sh deploy   # manual deploy from current local state
```

Crons (`vercel.json`):
- `/api/cron/digest` — Sunday 07:00 UTC (17:00 AEST) — weekly digest
- `/api/cron/digest` — Sunday 10:00 UTC (20:00 AEST) — weekly digest retry
- `/api/cron/ingest` — daily 13:00 UTC
- `/api/cron/trial-reminder` — daily 06:00 UTC
- `/api/cron/storm-brief` — daily 20:00 UTC (06:00 AEST)

Vercel reads `vercel.json` on each deploy and registers the crons; check
status with `vercel crons ls` after the first deploy.

**Hobby cron constraint (#84).** The Vercel project is on the **Hobby** plan,
which only permits crons that fire **at most once per day** — a more frequent
expression (e.g. `0 */3 * * *`) makes *every* deployment fail with "Hobby
accounts are limited to daily cron jobs", not just degrade. All five entries
above are daily-or-less (the two digest rows each fire weekly, on Sunday). The
storm-brief handler *wants* to run every 3 hours so warnings reach subbies
while actionable, but is capped to a single daily run to keep deploys green. It
is idempotent per warning-id (`StormBrief` unique constraint), so **on a Pro
upgrade**, restoring the 3-hourly cadence is a one-line revert of the
storm-brief `schedule` in `vercel.json` back to `0 */3 * * *` — no code change.

---

## Month 1 success criteria

Per `docs/18-roadmap-3-month.md`, end of May:
- 3 design-partner subscriptions at AUD $99 (GST included)
- Sunday digest delivers (manual researcher curation OK while scrapers
  come online)
- PostHog funnel measurable: landing → signup → onboarding → first paid
- Sentry catches at least one error in week 1 (if zero, the wiring is wrong)

---

## Common failures

| Symptom | Fix |
|---|---|
| Deploy succeeds, `/` returns 500 | Vercel function logs → likely DB unreachable; check Postgres is attached and `DATABASE_URL` is in production env |
| `/api/auth/login` returns 500 | Same as above. `auth/me` smoke check would have caught it |
| Stripe checkout 500 | `STRIPE_SECRET_KEY` is test mode (`sk_test_`) instead of live (`sk_live_`) |
| Cron returns 401 | `CRON_SECRET` mismatch between Vercel env and the cron handler's bearer check |
| Email never arrives | Resend domain not verified, or `from` address doesn't match the verified domain |
| Webhook receives but no DB write | `STRIPE_WEBHOOK_SECRET` doesn't match the live-mode webhook's signing secret |
