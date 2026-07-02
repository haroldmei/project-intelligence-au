# Market Gap Analysis & Q3 2026 Roadmap — PI-AU

**Date:** 2026-07-02
**Inputs:** full repo audit (code vs docs), AU competitor landscape research, market-requirements research (all July 2026).
**Status:** PROPOSED

---

## 1. Where the product actually is

The wedge pipeline is real code, not vaporware: signup → LGA scoping → ingest →
3-stage relevance (GIN rule filter → pgvector cosine → Claude Haiku rerank with
Sonnet fallback) → Sunday email (Resend) + SMS (Twilio) → HMAC thumbs → Stripe
28-day trial/renewal. Backend/FE/adversarial/e2e suites are substantive; the six
known e2e route bugs are fixed; cost-cap kill switch and webhook idempotency are
implemented.

But productionization is preview-stage:

- **No confirmed live deployment.** `.vercel/project.json` links
  `project-intelligence-au-prod`, crons are wired (and recently fixed POST→GET),
  functions pinned to `syd1` — but `state/state.json` still says
  `preview_ship: local-only-handoff`, signals are all `null`, and there is no
  custom domain (email still sends from `noreply@resend.dev`).
- **Prod data is manual.** The DAEX scraper (NSW Planning Portal exhibitions
  register) is real, but `docs/22-pipeline-enable.md` authorises manual
  researcher curation, and the only committed data is a 12-DA sample. The NSW
  Planning API and DA Leads adapters point at **placeholder endpoints that do
  not exist**.
- **The AI launch gate is unmet.** The eval set is **22 cases, not the 500
  labelled pairs** the wedge doc requires; no precision/recall run is recorded
  anywhere. The "precision ≥ 0.7 at recall ≥ 0.6" claim is a target, not a
  measurement.
- **The feedback-loop moat is starved.** Personalisation activates at
  ≥ 200 thumbs per user, but the digest was recently capped at **top-3 cards**
  — at ~80% thumb rate that is ~2.4 labels/week, i.e. **~1.6 years to
  activation**. The wedge doc's "200–400 pairs by week 4–6" math assumed 5–15
  cards. The moat as coded cannot compound.
- **Pricing is unsettled.** Code/marketing say Solo **$99 inc GST**, top-3
  framing, Team removed; docs (16-pricing, deploy runbook) still say
  $199/$499. No single source of truth.
- **Analytics is a stub.** No PostHog client in app code; consent plumbing
  exists but zero events are sent. Retention/activation cannot be measured.
- Smaller: no Sunday-cron retry (the wedge's declared highest-availability
  path fails silently until next Sunday), in-memory rate limiter, open
  adversarial gaps G-005 (prompt injection), G-006 (Twilio timing-safe
  compare), G-007 (period-end clamp).

## 2. Market findings

### 2.1 Existential — most re-roofs never generate a DA

NSW DPE's own fact sheet (Remedial Building Work, Codes SEPP 2008 s2.53(c))
classifies **re-roofing, roof cladding replacement, and waterproofing as
exempt development** — no DA, no CDC, no lodgement at all — unless heritage,
structural change, combustible cladding, or missing fire-safety statements
apply. Material-change re-roofs (tile→metal) go through **CDC** (private
certifier), which **is** in open data but is not ingested. Storm/insurance
re-roofs (a major channel for Sydney roofers) never touch planning data.

**Implication:** a DA-only feed structurally misses the majority of the ICP's
core re-roof work. What DA data does capture: new-build roofing (won via the
head contractor, not the owner), alterations & additions with roofline change,
heritage re-roofs, major strata upgrades. If churned customers say "these
aren't re-roof jobs," this is why. This is the single biggest gap between the
wedge narrative and reality.

Mitigations exist and are cheap: NSW ePlanning publishes **Online DA, CDC,
and PCC (Construction/Occupation Certificate) Data APIs** — all statewide
since 2019, daily updates, **CC-BY licensed**, access via a subscription key
requested by email. The NSW Pattern Book Code (Jul 2025) and Low & Mid-Rise
policy are pushing volume **into the CDC pathway**, making CDC ingestion more
valuable every quarter.

### 2.2 Kill-switch condition is substantially triggered

**DA Leads (daleads.com.au) — Pro at AUD 49/mo** — is self-serve,
cancel-anytime, and sells **weekly DA digests matched to trade & area with an
explicit Roofing category** (30+ trade buckets, 842k DAs, 335+ councils, AI
feasibility chat, REST API). This meets most of kill switch 5.3's
"sub-AUD-300/mo, self-serve, AI-relevance" condition at one-quarter (one-half
post-$99) of PI-AU's price.

Caveats: no funding/press/traction footprint (operated by LIMON TECH; possibly
a thin solo project); classification appears categorical, not
roofing-workflow curation; horizontal audience. It likely does **not** match
PI-AU on precision, "why this matched" explanations, or the Sunday cadence —
but that is unverified. **Action required before any strategic call: buy a
month of DA Leads Pro and audit its Sydney roofing lead quality hands-on.**

Also relevant: **SiteLens (UK, £29–39/mo)** is running the exact PI-AU
playbook against Glenigan profitably — the wedge pattern is validated
globally, and the self-serve price band is settling at **AUD ~50–150/mo**.
The recent $199→$99 cut was directionally right.

### 2.3 Incumbents — window still open

- **Cotality/Cordell**: entry ~$577.50/mo, no SMB or vertical SKU, no
  product-level AI relevance marketed; known pain: no CRM connector, manual
  re-entry hours.
- **Hubexo/LeadManager**: quote-only enterprise pricing; Trustpilot complaints
  about exit-hostile auto-renewal; 2026 roadmap mentions AI search and "more
  granular vertical coverage" (announced US-side; APAC unconfirmed) — the
  12–18-month window in the wedge doc is still open but ticking.
- **EstimateOne**: still tender-stage only, freemium for subbies; no DA move.
  For commercial roofing, E1 tender invites remain the incumbent workflow —
  PI-AU is complementary, not substitutive, and should say so.
- Consumer marketplaces (hipages $30–80/shared lead; Oneflare closing
  Jun 2026) don't serve commercial pipeline.

### 2.4 Demand-side facts that should shape Q3

- **Strata remediation is the funded demand pool**: 53% of 2016–22 NSW strata
  buildings have serious common-property defects; **waterproofing is the #1
  defect class (42%)**; avg rectification $283k/building; reachable via strata
  managers, not DAs.
- **Activation decides retention**: lead-gen SaaS churns 4.8–8.1%/mo; 43% of
  SMB churn lands in the first 90 days; onboarding-to-first-value < 7 days
  roughly halves churn. North-star metric: *first quoted job from a digest
  lead*.
- **Integrations buyers expect**: CSV export; job-management push — **AroFlo**
  (10–30-person commercial trades, documented REST API) first, then
  ServiceM8. Contact enrichment stays out (anti-axis; Cordell's moat).
- **SMS compliance** (Spam Act 2003): sender ID + functional unsubscribe
  honoured within 5 business days; STOP webhook exists — verify the
  unsubscribe SLA end-to-end.
- **Geographic expansion is a data cliff**: VIC (PPARS is aggregate-only) and
  QLD (council-by-council) have no NSW-grade statewide feed. Expand by trade
  within Sydney before expanding by metro.
- Macro: construction flat-to-negative in 2026 (-0.8% work done forecast);
  roofing ~$3.8–4bn, fragmented, flat — niche share-taking, not market
  growth, is the play.

## 3. Gap table

| # | Gap | Evidence | Severity |
|---|---|---|---|
| G1 | DA-only data misses most re-roof work (exempt development) | NSW DPE fact sheet; Codes SEPP s2.53(c) | **Existential** |
| G2 | $49/mo trade-matched competitor exists (DA Leads) — kill switch 5.3 | daleads.com.au pricing/features | **Strategic** |
| G3 | Not live: no prod deploy confirmed, no domain, no real users | state.json, resend.dev sender | **Blocking** |
| G4 | Prod ingest is manual/seed; real API adapters are placeholders | docs/22, sources.ts:76-84 | **Blocking** |
| G5 | Eval set 22 vs 500; no measured precision/recall (launch gate) | evals/rerank/dataset.jsonl | High |
| G6 | Feedback moat starved: 200-thumb threshold × top-3 digest ≈ 1.6yr | thumbs.ts, digest cap commits | High |
| G7 | No analytics (PostHog stub) → activation/churn unmeasurable | cookie-consent.tsx, package.json | High |
| G8 | Pricing inconsistent ($99 code vs $199/$499 docs) | git log vs docs/16, runbook | Medium |
| G9 | No Sunday-cron retry; in-memory rate limiter; G-005/6/7 open | docs/23 C2; FINDINGS.md | Medium |
| G10 | No CSV export / job-management integration (buyer expectation) | market research §5 | Medium |
| G11 | CDC/PCC feeds unused despite CC-BY availability and policy tailwind | ePlanning open data | High (fixes G1) |

## 4. Q3 2026 roadmap (July → September)

Theme: **prove the wedge with real data on real users — and fix the
lead-relevance problem before it becomes churn.**

### July — Go live and face the truth

1. **Deploy production for real**: custom domain, Resend verified domain,
   Stripe live keys, 12 env vars, `vercel --prod`; wire **PostHog + Sentry +
   support inbox** (G3, G7). Define events: digest_open, card_click,
   thumb, portal_clickthrough, trial_start, trial_convert, cancel.
2. **Real data feed**: request NSW ePlanning subscription keys (Online DA
   **and CDC and PCC** APIs — one email); rewrite the placeholder adapter
   against the real DA API; keep the DAEX scraper as fallback; retire the
   fictional DA Leads adapter (G4, G11 groundwork).
3. **DA Leads Pro audit** ($49, one month): measure their Sydney roofing
   recall/precision/freshness vs ours. Output: a positioning memo and a
   pricing decision. **Settle pricing in one place** — recommendation: hold
   $99 inc GST, reframe as "curated, explained, Sunday-cadence" vs DA Leads'
   raw categorical feed (G2, G8).
4. **First revenue**: 3–5 design partners via MBA NSW / HIA outbound; manual
   curation fallback per docs/22 is acceptable — buyers pay for curation, not
   automation.
5. Quick fixes: Sunday-cron re-fire (dedupe exists via DigestRun), Spam Act
   unsubscribe-SLA check, close G-006 (timing-safe compare — trivial).

### August — Fix relevance (G1) and the moat (G5, G6)

1. **Ingest the CDC feed** and label CDC re-roofs (tile→metal conversions are
   the strongest re-roof proxy in open data). Ingest **Construction
   Certificates** as a "work starting now" timing signal on digest cards.
2. **Reposition the digest honestly**: three lead classes — *builder pipeline*
   (new-build/A&A DAs), *fast-track* (CDC re-roofs, pattern-book), *strata &
   heritage*. Update landing copy; stop implying the digest catches all
   re-roof work.
3. **Eval harness to launch-gate standard**: grow 22 → 500 labelled pairs
   (design-partner thumbs + founder labelling + DaGroundTruth table already
   exists); record precision/recall per release; ship the "you saw N of M"
   recap only once measured.
4. **Unstarve the feedback loop**: raise digest back to 5–15 cards (top-3 can
   remain the SMS cut), and drop the personalisation threshold from 200 to
   ~25–30 thumbs. Target: personalisation active by week 6 of a customer's
   life, as the wedge doc promised.
5. **Storm/hail trigger (differentiator)**: BOM severe-weather alerts for
   subscribed LGAs → mid-week "storm brief" email. Cheap, unique vs DA Leads,
   and touches the insurance channel the ICP actually lives on.
6. Close G-005 (prompt-injection defence) and G-007.

### September — Retention, integration, and the strategic checkpoint

1. **Activation north star**: instrument and report *first quoted job from a
   digest lead within 90 days*; weekly cohort review of trial→paid and churn.
2. **CSV export + AroFlo push** ("send this lead to my job system"); ServiceM8
   next if partners ask (G10).
3. **Strata-remediation signal spike** (1–2 weeks, timeboxed): can Project
   Intervene / strata-manager channels yield a waterproofing/remediation lead
   class? This is the funded demand pool and a candidate second wedge that
   reuses the whole stack.
4. **Kill-switch checkpoint (end of Q3)**, per wedge §5:
   - ≥ 10 paying customers → continue roofing; plan vertical #2 (civil subs)
     for Q4 using the CDC/PCC infra.
   - < 10 paying after ~8 weeks of live outbound → demand kill 5.1 fires:
     pivot to vertical #2 or to the strata-remediation wedge, reusing the
     pipeline.
5. **Launch-tier hardening only if ≥ 20 paying**: DB-backed rate limiter,
   remaining deferred security items, tier upgrade `preview → launch`.

### Explicitly not in Q3

Melbourne/Brisbane (no statewide feeds — per-council scraping cost),
contact-data enrichment (anti-axis; Cordell's moat), multi-trade digest
toggle (separate launch, not a feature), free tier, API access, native app.

## 5. Success criteria for the quarter

| Metric | Target (end Sep) |
|---|---|
| Live production with automated NSW DA + CDC ingest | Yes |
| Paying customers | 10 (kill-switch floor), 20 stretch |
| Measured rerank precision/recall on ≥ 500-pair set | ≥ 0.7 / ≥ 0.6 |
| Digest CTR (proxy for relevance; opens are MPP-inflated) | ≥ 10% |
| Customers reporting a quoted job from a digest lead in first 90 days | ≥ 50% of actives |
| Monthly churn | ≤ 6% (category median) |
| Personalisation active per customer | By week 6 |

---

*Sources: NSW DPE remedial-building-work fact sheet & Codes SEPP 2008;
planningportal.nsw.gov.au open-data APIs (DA/CDC/PCC); daleads.com.au;
sitelens.co.uk; cotality.com; apac.hubexo.com; estimateone.com; NSW Building
Commission 2023 Strata Defects Survey; ACIF May 2026 forecast; IBISWorld
roofing AU; ACMA Spam Act guidance. Full citations in the research agents'
reports (session transcript).*
