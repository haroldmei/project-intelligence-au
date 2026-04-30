# Code review fixes — 2026-04-30

Tracks the fixes shipped from the comprehensive code review. Two commits on
`develop`. Reference for what changed and what's still outstanding.

---

## Wave 1 — no-migration code fixes (commit `9726de4`)

| ID | Severity | Where | What |
|---|---|---|---|
| C1 | Critical | `src/modules/digest/assemble.ts` | SMS `/s/<slug>` redirect was 404'ing every link. Now persists a `ShortUrl` row before sending. |
| C3 | Critical | `src/modules/account/service.ts` | P2025 idempotency check now uses `err.code` instead of fragile `err.message.includes("P2025")`. |
| H1 | High | `src/emails/weekly-digest.tsx` | HTML-escape every `${card.X}` interpolation — defends against scrape/LLM-injected content. |
| H2 | High | `src/modules/digest/assemble.ts` | SMS body length budget (320 chars / 2-part), truncates address as needed, drops cards if still over. |
| H4 | High | `src/modules/digest/cron.ts`, `src/app/api/cron/trial-reminder/route.ts`, `src/lib/ai/cost-ledger.ts` | `take` caps on previously unbounded `findMany` queries. |
| M1 | Medium | `src/lib/ai/rerank.ts` | Default `minScore` aligned to 3 (matches relevance-pipeline). |
| M2 | Medium | `src/emails/weekly-digest.tsx` + `src/modules/digest/assemble.ts` | Surface `fallbackUsed` in the email so a degraded digest week is visible to the user. |
| M3 | Medium | `src/emails/weekly-digest.tsx` | Skip empty Applicant row (DAEX records have null applicant). |
| M4 | Medium | `src/app/api/webhooks/stripe/route.ts` | Handle `invoice.payment_action_required` (3DS/SCA). Sets `past_due` so user sees update-card CTA. |
| M7 | Medium | `src/modules/digest/cron.ts` | Persist a `Digest` row with `email_status='skipped'`/`'failed'` even when relevance returns null or per-user error. Observability. |
| M8 | Medium | `src/modules/digest/assemble.ts`, `src/lib/ai/relevance-pipeline.ts`, `src/modules/relevance/filters.ts` | Pass `applicantName` + `portalUrl` through `CandidateDA` to avoid 15 N+1 lookups per digest send. |
| L4/L5/L8 | Low | `src/lib/email/client.ts` | `console.log` → `logger.info`; dynamic `require()` → static imports (drop 6 eslint-disable comments). |
| L6 | Low | `src/app/api/webhooks/twilio/route.ts` | Refuse the request in production if `TWILIO_AUTH_TOKEN` is unset (prevents anonymous SMS opt-outs). |
| L10 | Low | `src/modules/digest/assemble.ts` | Sentry capture on email-send failure. |
| T1 | Test | 3 fixture files | All three pre-existing failing tests fixed. 93/93 backend tests green (was 90/93). |

### Tests

- `__tests__/feedback/token.test.ts` — `beforeEach` was overriding `process.env.FEEDBACK_HMAC_SECRET`, but `env.FEEDBACK_HMAC_SECRET` is cached at module-load time. The test was signing with one key while the validator verified with another → "tampered" instead of "expired". Fix: read the test secret from `process.env` once at top, after `setup-env.ts` has already populated it.
- `__tests__/ingestion/ingest.test.ts` — assertion `count === 1` was wrong: the mock returned the same DA for every council the dispatcher routes to, producing N rows (one per matching council). Reframed to "running twice doesn't grow the count" — the actual idempotency promise.
- `__tests__/relevance/cost-cap.test.ts` — `db` mock was missing `$queryRaw` that `runRelevanceForUser` calls for the embedding lookup. Added it inline (vi.mock factories run before top-level consts).

---

## Wave 2 — DB migration + architectural changes (commit `<TBD>`)

| ID | Severity | Where | What |
|---|---|---|---|
| C2 | Critical | `src/lib/cron/retry.ts`, `src/app/api/cron/digest/route.ts`, `src/app/api/cron/ingest/route.ts` | Removed `withRetry()` — its 15-min in-process sleep was always killed by Vercel's 5-min `maxDuration`. The "NFR-022 retry" was never actually delivered. Failed cron ticks now surface as 500 + Sentry; retry pattern is "schedule the cron more often than needed and dedupe per tick." Documented inline. |
| H3 | High | `prisma/migrations/20260430110719_trial_reminder_sent_at/`, `prisma/schema.prisma`, `src/app/api/cron/trial-reminder/route.ts` | Added `users.trial_reminder_sent_at` column. Cron now selects `WHERE trialReminderSentAt IS NULL AND createdAt <= 26d ago`, then sets `trialReminderSentAt` after each successful send — so DST drift, function timeouts, and missed ticks never double-send. |
| H5 | High | `src/lib/auth/rate-limit.ts` + 5 routes | New `rateLimitMutatingByUser(userId, route)` helper — 30 req/hr per user. Applied to `/api/billing/{checkout,portal,subscription}` and `/api/account/{lga-bundles,saved-query}`. Defends against cost amplification (Stripe customer creation, OpenAI embed). |

### Migration: applying

```bash
# Local dev
DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"') \
pnpm exec prisma migrate deploy

# Staging — auto-runs as part of vercel-build on deploy
git push origin develop  # if branch is wired to staging Vercel project

# Production — same
```

### Behavioral change: cron retry

**Before**: `withRetry(() => runDigestCron(), { delayMs: 15 * 60 * 1000 })`. The retry was a no-op because the in-process sleep exceeded Vercel's function timeout. Operators wouldn't notice the absence of retry behaviour because the failure log looked identical.

**After**: Cron handlers fail fast on first error, return 500 to Vercel + Sentry exception. **Retry is the next scheduled tick's responsibility.** For the digest cron (Sunday weekly), this means a failed Sunday isn't recoverable until next Sunday — operators must triage immediately. For the ingest cron (daily), a missed day catches up the next day.

When ready, the right next iteration is to schedule each cron more frequently than its semantic period and dedupe at the database level — e.g. weekly digest as `0 7 * * 0,1,2` (Sun, Mon, Tue at 07:00 UTC) with `WHERE NOT EXISTS (digest_run WHERE week = current_week)` idempotency. Until then, the schedule and the semantic frequency are 1:1.

---

## Deferred

Items from the review **not** addressed in either wave:

- **A1** DB-backed rate limiter — current in-memory limiter doesn't share across Vercel function instances. Defer until > 50 paid users (system-design §6.4 trigger).
- **A2** Periodic cleanup of `stripe_webhook_events` table — small cron at launch tier.
- **A3** Archival policy on `ai_cost_log`.
- **M6** Lucia v3 maintenance-mode migration — multi-week effort, defer until library actually breaks.
- **L1** Stub data in 2 remaining portal pages (digest/history) — calls real APIs but defaults to stub state. Same pattern as the area-page fix from a previous session. (`/account/sms` fixed in commit below: now loads real state from `/api/account/me` and hits the correct opt-in/out endpoints; toggle is disabled until loaded and when the user has no mobile number on file.)
- **L2** Real ABN in `src/emails/_components/Footer.tsx` — operator-supplied data, not a code fix.
- **T2** E2E coverage for SMS pathway — would have caught C1 earlier; worth adding once SMS is verified end-to-end.

---

## Verification commands

After Wave 2 deploy:

```bash
# Migration applied
psql "$DATABASE_URL" -c "\d users" | grep trial_reminder_sent_at

# Trial-reminder dedupe — re-run cron, observe no duplicate sends
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://staging.pi-au.com/api/cron/trial-reminder
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://staging.pi-au.com/api/cron/trial-reminder
# Second call should report `reminded: 0` for already-notified users

# Rate limit fires
for i in $(seq 1 35); do
  curl -s -o /dev/null -w '%{http_code} ' \
    -X POST https://staging.pi-au.com/api/billing/checkout \
    -H 'Cookie: lucia_session=<your session>' \
    -H 'Content-Type: application/json' \
    -d '{"plan":"solo"}'
done
# Should see 200/4xx for the first ~30 calls, then 429
```
