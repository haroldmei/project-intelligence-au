# Enabling the digest pipeline in production

The Sunday-digest pipeline is fully wired in code (ingestion → relevance → email/SMS) but ships with **no DA records** in the production database. Until the council scrapers come online, the runbook authorises **manual researcher curation** as the data source (`docs/19-deploy-runbook.md` Month-1 success criteria).

This doc covers exactly that path: how a curated JSON file of Sydney roofing DAs becomes a customer's Sunday digest.

---

## The 30-second mental model

```
data/das/<week>.json  →  scripts/import-das.ts  →  development_applications
                                                +  da_embeddings
                                                +  ingestion_log
                                                       │
              vercel.json cron (Sun 17:00 AEST + 20:00 AEST resume retry)        │
                              │                        │
                              ▼                        ▼
                        runDigestCron() ──── reads ────┘
                              │
                              ▼
                   per-user 3-stage relevance
                              │
                              ▼
                       email + SMS sent
```

Once DAs are in the DB with embeddings, the existing Sunday cron at `/api/cron/digest` does the rest. No new pipeline code needed.

---

## Curating a week's DAs

### File format

`data/das/<YYYY-MM-week>.json` — JSON array. Required fields per record:

```json
{
  "daId": "DA-2026/0124",
  "council": "penrith",
  "address": "42 Acacia Avenue, Penrith NSW 2750",
  "description": "Demolition of existing tile roof and installation of Colorbond metal deck roofing.",
  "estimatedValue": 28500,
  "lodgementDate": "2026-04-25",
  "applicantName": "Smith Roofing Pty Ltd",
  "portalUrl": "https://da.penrith.city.gov.au/da/0124",
  "rawScopeText": "Re-roof: remove 180sqm concrete tile, install Colorbond Trimdek 0.42 BMT in Surfmist…"
}
```

| Field | Required | Notes |
|---|---|---|
| `daId` | yes | Council reference, unique within `(daId, council)` |
| `council` | yes | One of the 15 in `ALL_COUNCIL_SLUGS` (`src/modules/ingestion/ingest.ts:20`) — the script rejects any other value |
| `address` | yes | Free text, ≥ 5 chars |
| `description` | yes | Short scope summary — the LLM rerank reads this, so accurate verbs matter ("re-roof", "replace") |
| `estimatedValue` | no | AUD, integer; `null`/omit if unknown |
| `lodgementDate` | yes | `YYYY-MM-DD`. The Stage-1 rule filter only considers DAs lodged in the past 7 days, so use a recent date if you want it in this Sunday's digest |
| `applicantName` | no | Builder/applicant name shown on the email card |
| `portalUrl` | yes | Must be a valid URL — what the customer clicks |
| `rawScopeText` | no but **strongly recommended** | The full scope blob from the council portal. Both the embedding and the LLM rerank consume this — high-signal text dramatically improves rank quality |

A working sample lives at `data/das/sample-roofing-week.json` (12 records spanning 9 LGAs, mix of relevant + irrelevant scopes).

### Validation

The script Zod-validates every record before touching the DB. A single malformed row aborts the whole run — fix the file and re-run.

---

## Running the import

### Local / dev

```bash
pnpm import-das data/das/sample-roofing-week.json
```

This reads `DATABASE_URL` and `OPENAI_API_KEY` from `.env.local`.

### Against production

```bash
pnpm import-das:prod data/das/2026-04-week3.json
```

That's a shortcut for `tsx --env-file-if-exists=.env.production.local scripts/import-das.ts <file>`, which loads every var the env validator needs from one file. Don't try to set `DATABASE_URL=…` and `OPENAI_API_KEY=…` on separate lines — bash variable assignments without `export` don't persist to the next command.

It's **idempotent**: `(daId, council)` uniqueness means you can edit the file and re-run; existing rows get updated, embeddings get refreshed.

If OpenAI billing/quota is temporarily blocked, the DA rows can still be loaded without vectors:

```bash
pnpm import-das:prod data/das/2026-04-week3.json --skip-embeddings
```

Use that only as an operational fallback. The digest pipeline needs embeddings for vector ranking, so fix OpenAI quota and rerun the normal import before sending a real Sunday digest.

### Cost

Each DA costs one OpenAI `text-embedding-3-small` call — about **AUD $0.00006** per record at current pricing. 100 DAs = ~AUD $0.006. The script attributes embeddings to `userId: null` so nothing hits the per-user weekly cost ledger.

### What the script does, in order

1. Parses + Zod-validates the JSON file
2. **Upserts** every record into `development_applications` keyed on `(daId, council)`. `sourceApi` is set to `"manual"` so you can grep audit-log queries later.
3. **Embeds** every record in one batched OpenAI call (`embedBatch`, up to 2048 inputs)
4. **Upserts** vectors into `da_embeddings` via raw `$executeRaw` (Prisma can't natively write `vector(1536)`)
5. Writes one `ingestion_log` row per council so the drift detector (FR-003) doesn't false-alarm on a council that's only fed by manual imports

---

## Verifying it landed

Pointing at the prod DB:

```sql
-- DA count by council in the last week
SELECT council, count(*)
FROM development_applications
WHERE source_api = 'manual'
  AND ingested_at > now() - interval '7 days'
GROUP BY council
ORDER BY count(*) DESC;

-- Embeddings exist?
SELECT
  count(*) AS das,
  count(e.da_id) AS embedded
FROM development_applications d
LEFT JOIN da_embeddings e ON e.da_id = d.id
WHERE d.source_api = 'manual';
```

If `embedded < das`, the embed step partially failed — re-run the script (idempotent).

---

## Triggering Sunday's digest manually

The cron is configured in `vercel.json` to fire `/api/cron/digest` at Sun 07:00 UTC (= 17:00 AEST), with an idempotent resume/retry tick at 10:00 UTC (= 20:00 AEST) that re-processes only the users the primary left unserved and is a no-op after a fully-successful run. To trigger a run **now** for testing:

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.production.local | cut -d= -f2- | tr -d '"')
curl -X GET -H "Authorization: Bearer $CRON_SECRET" \
  https://www.pi-au.com/api/cron/digest
```

The endpoint runs `runDigestCron()` synchronously — for N ≤ 100 subscribers this returns within 60s (NFR-001). For longer runs, fire it as a background job; the response is informational only.

### Per-user manual run (no real email/SMS)

If you want to drive the relevance pipeline for one user without sending an email, run the local script against prod credentials:

```bash
pnpm digest:now:prod <userId>
```

To suppress real email sends during this dry run, blank `RESEND_API_KEY` for the call:

```bash
RESEND_API_KEY="" pnpm digest:now:prod <userId>
```

Setting `RESEND_API_KEY=""` puts `email/client.ts` into dev-mode no-op (it `console.log`s instead of sending). The `Digest` and `DigestDa` rows still get created, so you can inspect what *would* have been emailed via SQL or the `/digest` portal page.

---

## Prerequisites for a user to receive a digest

The cron filter at `src/modules/digest/cron.ts:51-53`:

```sql
WHERE email_verified = true
  AND subscription_status IN ('trial','active')
```

A user who signed up but didn't complete onboarding **won't** receive a digest — `runRelevanceForUser` returns `null` if they have no `saved_query_embedding` or no `lgaBundles`. To verify a candidate user is digest-ready:

```sql
SELECT
  u.id,
  u.email,
  u.email_verified,
  u.subscription_status,
  u.saved_query_embedding IS NOT NULL AS has_query_embedding,
  count(s.bundle_id) AS bundles
FROM users u
LEFT JOIN lga_bundle_subscriptions s ON s.user_id = u.id
WHERE u.email = 'subscriber@example.com'
GROUP BY u.id;
```

All four conditions must be `true` / `>= 1`.

---

## Operational rhythm (Month 1)

Per `docs/18-roadmap-3-month.md`:

1. **Mon–Wed**: researcher pulls fresh DAs from council portals (NSW Planning Portal e-services, council DA-tracker pages) and writes them into `data/das/<week>.json`.
2. **Thu**: founder reviews the file (~15 min for 50–100 records); validates scope text reads accurately.
3. **Thu evening**: run `pnpm import-das` against prod. Verify counts via SQL.
4. **Sun 17:00 AEST**: Vercel fires `/api/cron/digest` (primary tick). Subscribers receive emails by 17:30 AEST.
5. **Sun evening**: monitor Sentry + Resend dashboard for delivery failures. **Do NOT manually re-trigger the cron before 20:00 AEST** — a second idempotent resume tick fires at 10:00 UTC (= 20:00 AEST) that re-processes only the users the primary left unserved, and is a no-op after a fully-successful run.

Once council scrapers are live (`src/modules/ingestion/sources.ts` already has the NSW Planning Portal + DA Leads adapters; they need real API keys + endpoint URLs), the manual flow becomes a **fallback** rather than the primary source. The same `development_applications` table receives both — the `source_api` column distinguishes them.

---

## Automated ingestion paths

`/api/cron/ingest` runs daily 13:00 UTC and dispatches per-council via `fetchCouncilDAs()` in `src/modules/ingestion/sources.ts`. The dispatcher tries each adapter in priority order; configure whichever path you want enabled and the rest are silent fallbacks.

### Path A — DA Exhibitions HTML scrape (no signup, ships today)

The public NSW Planning Portal register at `https://www.planningportal.nsw.gov.au/daexhibitions` covers all 15 of our LGAs with no API key. Filter by LGA + status, paginate, parse with cheerio, eagerly fetch each detail page for the property address and full type-of-development scope text.

To enable in production:

1. Append `DAEX_INGEST_ENABLED=true` to `.env.production.local`.
2. Push the env var to Vercel **and** redeploy:
   ```bash
   scripts/deploy.sh env-up    # writes to Vercel project settings
   scripts/deploy.sh deploy    # rebuilds with the new env baked in
   ```
   Both steps are required. `env-up` alone updates Vercel's stored env values
   but the running deployment keeps using the env baked in at its build time —
   `src/lib/env.ts` reads `process.env` at module load and Next.js inlines it.
3. Trigger the ingest cron once to verify (or wait for the next 13:00 UTC tick):
   ```bash
   CRON_SECRET=$(grep '^CRON_SECRET=' .env.production.local | cut -d= -f2- | tr -d '"')
   curl -X GET -H "Authorization: Bearer $CRON_SECRET" https://www.pi-au.com/api/cron/ingest
   ```
   Then check `ingestion_log` for one row per council with `source_api='da_exhibitions'`.

**Coverage caveat (snapshot 2026-04-30):** "On Exhibition" status is a narrow public-comment window (typically 14–28 days). At the moment of writing, only Cumberland (15 records) had any active exhibitions across our 15 LGAs; most showed 0. Coverage fluctuates as councils open and close exhibition windows. Plan for thin weeks early on; combine with the manual `import-das` curation path (above) for gap-fill.

**Brittleness:** the parser keys on Drupal CSS classes (`field-field-panel-reference-number`, `field-field-council-unique-number`, `card__title`, `icon--pin`). The Portal redesigns its markup occasionally; when this happens, run `pnpm exec vitest run -c vitest.backend.config.ts __tests__/ingestion/daex-parsers.test.ts` and update selectors in `src/modules/ingestion/sources.ts` (`parseDaexListing` / `parseDaexDetail`). Fixtures live in `__tests__/ingestion/fixtures/`.

**Politeness:** every list+detail fetch goes through `fetchTextWithRetry` with a `User-Agent: ProjectIntelligence-AU/1.0` header and a 500ms `politeDelay` between requests. ~150 requests per ingest run, ~2.5 minutes of wall-time at the polite cadence. Well within sane scraping bounds.

### Path B — NSW ePlanning Online DA Data API (best long-term, blocked on email approval)

The authoritative Online DA Data API covers every DA lodged on the NSW Planning Portal since Jan 2019 (all NSW councils since 01/07/2021), including all 15 of our LGAs, updated daily, CC-BY licensed. Approval process is email-based and takes 2–6 weeks.

1. Email `[email protected]` with org details (ABN, registered address, contact, use case). The Online DA Data API at `https://www.planningportal.nsw.gov.au/opendata/dataset/online-da-data-api` is the right product for read-only feed access; the same subscription key covers the CDC + PCC feeds.
2. When the key arrives, set `NSW_PLANNING_API_KEY` (and, if the gateway base differs from the default, `NSW_PLANNING_API_BASE`) in Vercel env. The `fetchNswPlanningDAs` adapter (`src/modules/ingestion/sources.ts`) handles pagination, incremental fetch, the 15-LGA filter, and field mapping. Reconcile the response field names against the DA Open APIs Data Dictionary the first time real data flows.

The dispatcher now prefers Path B automatically: whenever `NSW_PLANNING_API_KEY` is set, the Online DA Data API is used for our subscribed LGAs and the DAEX scrape (Path A) becomes the no-key fallback.

### Path C — Manual import (always available)

The `pnpm import-das:prod` flow above. Use it as gap-fill when an automated source is down for a council, or to inject a high-value DA the aggregators missed.

The drift detector (FR-003) alerts on any council whose count drops by >50% week-over-week — including transitions like "manual filled last week → DA Exhibitions picked up this week." This is intentional; it surfaces source switchovers.

### Path D — State Significant Development register (Teams-tier; dormant)

The NSW Planning Portal also maintains a separate register at `/major-projects/projects` for **State Significant Development** — the pathway for major schools, hospitals, public infrastructure, and large mixed-use (>$30m). The DAEX register doesn't cover these; they're filed elsewhere because the Minister for Planning is the consent authority instead of the council.

**Why dormant**: a state hospital with a 50,000 sqm roof is a different lead universe from a Western Sydney re-roof. Surfacing both in the same digest would dilute the residential roofer's experience. SSD ingestion is intended for a future **Teams-tier** subscription targeting commercial roofers and tier-2 builders bidding on government work.

The adapter (`fetchSsdProjects()` in `src/modules/ingestion/sources.ts`) is built and parser-tested but **not wired into `fetchCouncilDAs()`**. To enable it for a Teams-tier cron:

1. Set `SSD_INGEST_ENABLED=true` in Vercel env (Production scope).
2. Build a separate cron handler that calls `fetchSsdProjects(lgaName)` for each LGA in the Teams subscriber's bundle.
3. Persist with `sourceApi='ssd_register'` so the residential digest's rule filter naturally excludes them (it only joins `lga_bundle_subscriptions`, but you'd add a per-tier filter once Teams ships).

SSD detail pages expose fields the standard DAEX register doesn't:
- **Contact Planner Name + Phone** — direct ministerial contact, useful for tier-2 builder outreach.
- **Free-text project description** — typically richer than DAEX scope text.
- **Attachments & Resources** section — links to plans, EIS, BCA reports (most DAs only host these on the council DA tracker, but SSDs centralise them here).

Volume snapshot 2026-04-30: ~9,627 active SSD projects across NSW. Per-LGA varies — Sydney metro councils typically have 50–200 active SSDs.

---

## Files added

| Path | Purpose |
|---|---|
| `scripts/import-das.ts` | The importer. ~110 lines, uses existing `embedBatch` + Prisma upserts |
| `scripts/run-digest-now.ts` | Local-runnable digest trigger; supports full-cron and per-user modes |
| `data/das/sample-roofing-week.json` | 12 reference DAs across 9 LGAs |
| `package.json` scripts | `pnpm import-das <file>` and `pnpm digest:now [userId]` shortcuts |
