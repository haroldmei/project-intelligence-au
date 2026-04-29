# 3-Month Roadmap — ProjectIntelligence (PI-AU)

**Date:** 2026-04-29
**Status:** v0.1.0-preview-ready (local-only); pre-deploy

## Project state at the time of writing

PI-AU is sitting at `v0.1.0-preview-ready` — fully built (auth, RAG, emails, Stripe,
landing page, legal) but local-only, with:

- No public URL
- No real council DA scrapers yet (seed/sample data only)
- No signal sources wired (PostHog / Sentry / support inbox all disabled)
- 17 V2 features deferred
- 9 Med/Low security items deferred to launch tier

The strategic question for the next 3 months is **which risk to retire first** —
go-to-market or product depth.

---

## Three roadmap options

### Option A — Ship-and-Sell (recommended)

Optimise for first dollar; treat the digest as the product *now*.

**Month 1 (May)** — Deploy
- Vercel prod + managed Postgres + 12 env vars + Resend domain + Stripe live keys
- Wire PostHog + Sentry + a support inbox
- Run the human-loop fallback: a researcher hand-curates the Sunday digest from
  the 15 LGAs each week while the scrapers come online
- **Goal: 3 design-partner subs at AUD $199 by end of month**

**Month 2 (June)** — Replace the human with code
- Real scrapers for the top 5 LGAs (Penrith, Blacktown, Parramatta, Cumberland,
  The Hills), then expand to 15
- Wire HNSW+GIN indexes (already flagged as backend follow-up)
- Run `signal-iterate` against PostHog funnels and thumb up/down feedback
- **Goal: 10 paying subs, churn baseline measured**

**Month 3 (July)** — Retain + ramp
- Resolve the 9 deferred Med/Low security items (launch-tier gate)
- Upgrade scale tier `preview → launch` (background-jobs, env-manager, cicd,
  deployer, observability, rollback, production-readiness)
- Run the first real `iterate` cycle on Sunday-digest open-rate and
  14-day-trial → paid conversion
- **Goal: 20 paid + an honest retention number**

**Tradeoff:** you sell something partially manual for 4–6 weeks. Acceptable
because the wedge value is *curation*, not automation — buyers don't see the
human-vs-scraper seam.

### Option B — Build-then-Sell

Flip months 1 and 2: scrapers + launch-tier hardening first, public sale only
after the pipeline is fully automated.

**Tradeoff:** zero customer signal for ~8 weeks while you build something the
market hasn't validated yet — high risk for a niche wedge.

### Option C — Adjacent expansion

Ship roofing in May, add a second trade (HVAC/electrical) or a second metro
(Melbourne) in June–July.

**Tradeoff:** dilutes the niche moat the wedge was specifically chosen to
defend; premature for a product with zero paying customers.

---

## Recommendation: Option A

The biggest unknown isn't *"can we scrape 15 council portals"* — it's
*"will Eli actually pay AUD $199/mo on Sunday night for this."* Everything
else is downstream of that answer.

---

## Addendum — deploy-readiness items addressed 2026-04-29

The following blockers identified during pre-deploy review have been resolved,
reducing Month 1 scope:

- **Seed data made reproducible.** `prisma/seed.ts` (reference data: 4 bundles
  + 15 LGAs, idempotent) and `scripts/dev-seed.ts` (demo: eli@example.com +
  sample DAs + demo digest, gated to non-production) now exist. Vercel deploys
  invoke both via the new `vercel-build` script.
- **9 missing runtime/dev deps restored** to `package.json` (`lucide-react`,
  `clsx`, `tailwind-merge`, `@sentry/nextjs`, `react-hook-form`,
  `@playwright/test`, `@testing-library/jest-dom`, `@vitejs/plugin-react`,
  `fast-check`). Without these, `pnpm dev`/`pnpm build` errored on first run.
- **FE/DB bundle id mismatch fixed.** `(portal)/account/area/page.tsx` and
  `(auth)/onboarding/area/page.tsx` were sending `inner_west` while DB had
  `inner_west_and_city`; would have caused 500s for anyone selecting "Inner
  West & City" in production.

What still remains for Month 1: provision Vercel Postgres, set the 12 env
vars (Stripe live keys, Resend domain, NSW Planning + DA Leads keys, Twilio,
HMAC secrets), run `vercel link && vercel --prod`, then wire PostHog + Sentry.
