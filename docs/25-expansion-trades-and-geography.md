# Expansion Strategy — Trades, Australia, New Zealand

**Date:** 2026-07-02
**Status:** PROPOSED (feature-extension suggestion; does not unlock the V1 anti-axis on its own)
**Inputs:** docs/24 gap analysis; July 2026 research pass on per-application
planning-data availability across all AU jurisdictions + NZ, and on which
trades approval data serves with high recall.

The wedge doc (01c §3) forbids expansion *in V1* — this doc is the map for
what comes after, sequenced behind paying-customer gates so we never dilute
the niche before it's proven. Guiding rule kept from the wedge: **every
expansion is a separate wedge launch (own vocabulary, own eval set, own
landing page), never a feature toggle on the roofing digest.**

---

## 1. What the data supports — the expansion matrix

The product's core asset is: *jurisdiction feed adapter × trade vocabulary
pack × relevance pipeline × digest*. Expansion cost is therefore driven by
two questions: does per-application data exist (geography), and does the
trade's work mandatorily generate approval records (trade recall)?

### 1.1 Trade recall in NSW DA/CDC/PCC data (which jobs are actually visible)

| Trade | Recall in planning data | Why |
|---|---|---|
| **Demolition** | **High** | DA or CDC mandatory for nearly all demolition (Codes SEPP General Demolition Code); named development type |
| **Swimming pools** | **High** | CDC (Housing Code) or DA mandatory; NSW Swimming Pools Register as a second dataset |
| **Civil / earthworks / subdivision** | **High** | Subdivision DAs + mandatory Subdivision Works Certificate (in the PCC API we're already ingesting) |
| Fire services | Medium | Fire Safety Schedule issued with every CC/CDC; but the recurring AFSS compliance market has no open feed |
| HVAC / mechanical | Medium | No category; inferred from commercial/industrial development types |
| Landscaping | Med-low | Standalone work exempt; inferred from dwellings/pools |
| Electrical / plumbing | Low | On every project, never a distinct approval — tender platforms (EstimateOne) own this |
| Waterproofing | Low | Bundled into other work; bathroom renos exempt |
| Solar | Low | Exempt development at any roof-mounted capacity |

Two implications:

- **Demolition, pools, and civil are better-matched to our data source than
  roofing is.** Roofing (our V1) suffers the exempt-development recall gap
  (docs/24 §2.1); demolition and pools have *mandatory* approval triggers.
  The wedge doc pre-scored civil as vertical #2 — the data supports it, and
  pools/demolition are cheaper still because they're category-filterable
  (development-type enums) rather than vocabulary-inferred.
- Electrical, plumbing, solar, waterproofing are **not** viable planning-data
  verticals. Don't build them; don't promise them.

### 1.2 Geography — per-application data cost, ranked

| Jurisdiction | Feed | Engineering cost | Notes |
|---|---|---|---|
| **SA** | **Statewide public ArcGIS FeatureServer** (`location.sa.gov.au/...DevelopmentApplicationRegister_PRODUCTION/FeatureServer/1`) — per-application, all 60+ councils since ~2021, incl. 4,000-char nature-of-development, status, pathway, lodgement date | **Low** — near drop-in second jurisdiction | No cost-of-work $ field (rank without value, or model it); **license unconfirmed** (FeatureServer copyright metadata empty; plan.sa.gov.au terms bot-blocked) — must verify before commercial use |
| **NT** | Territory-wide JSON endpoint (`ntlis.nt.gov.au/planning-notices-online/notices/json`) | Low | Market too small alone; free add-on later |
| **ACT** | Single government register, scrape (open-data dataset retired) | Med-low | Small market; no open license |
| **VIC** | No statewide feed (PPARS = aggregates); per-council registers (City of Melbourne has API) | Medium-high | Metro-scoped only: top ~10 Melbourne councils by scraper |
| **QLD** | No statewide feed; Brisbane Development.i + open-data API is strong | Medium | Brisbane-scoped first; hail/storm belt strengthens the roofing storm-brief angle |
| **NZ** | No national per-application feed; **paid council subscriptions** — Auckland consents list NZ$1,965/yr weekly (~43% of national volume), Christchurch NZ$192/yr | Medium | See §3 — the constraint is the ICP, not the data |
| **WA** | ~140 councils each with own tracker; state feeds cover big projects only | **High** | Defer |
| **TAS** | PlanBuild statewide rollout completes ~end-2027 | High now | Re-evaluate 2027 |

## 2. Recommended sequence (gated, not dated)

Each wave unlocks on a **customer gate**, not a calendar date, per the
kill-switch discipline in 01c §5.

### Wave 0 — now, nearly free: instrument demand

- **Waitlist capture** on the landing page and signup flow: "not a Sydney
  roofer? tell us your trade + region." Store (trade, region, email). The
  wedge doc already mandates waitlisting Melbourne roofers — make the
  waitlist a measurement instrument for every future wave.
- **Development-type enum audit** of our own stored DA/CDC rows: verify
  demolition/pool/subdivision categories are cleanly filterable (the
  research flagged the exact enum strings as low-confidence).
- Close the SA license question (human task: read plan.sa.gov.au terms,
  email PlanSA if ambiguous) so Wave 2 is de-risked early.

### Wave 1 — trade #2 in Sydney (gate: ≥ 10 paying roofing customers)

**Pick: demolition or pools first, civil second.** Rationale: highest
recall, category-filterable (no vocabulary cold-start), same 15-LGA feeds,
same digest machinery — marginal cost is a vertical pack + eval set +
landing page. Civil (the pre-scored vertical #2) follows once the PCC
subdivision-works signal is proven in production.

Per-trade launch checklist (this becomes the repeatable playbook):
1. Vertical pack: rule lexicon + rerank prompt fragment + development-type
   filters.
2. 100-pair labelled eval set minimum before beta, 500 before GA
   (precision ≥ 0.7 / recall ≥ 0.6 — same gate as roofing).
3. Own landing page + wedge sentence; **separate digest** even for a
   customer who buys two trades (anti-axis: no multi-trade digest).
4. Digest cadence tuned to the trade's rhythm (Sunday 6 pm is a roofing
   ritual, not a law — validate per trade with design partners).
5. Pricing: same $99 band unless discovery says otherwise.

### Wave 2 — Adelaide, SA (gate: 2 trades live in Sydney, OR roofing at ~50 paying)

- Build the **jurisdiction adapter interface** (§4) against the SA ArcGIS
  FeatureServer; reuse whichever trades are already proven.
- SA quirks: no $ value field (hide the value chip or estimate it);
  assessment-pathway field replaces our DA/CDC split; LGA bundles →
  "region bundles" (Adelaide metro councils).
- Adelaide is the *validation* that the platform generalises. If the
  adapter interface is right, NT comes along nearly free afterwards.

### Wave 3 — Melbourne + Brisbane, metro-scoped (gate: SA unit economics ≥ Sydney's)

- Not statewide: top ~10 Melbourne councils (per-council scrapers, City of
  Melbourne API first) and Brisbane (Development.i API).
- Brisbane pairs naturally with the **storm-brief** feature (hail belt) —
  the roofing insurance channel is stronger there than DA data.
- This wave is where scraper-fleet maintenance becomes a real cost line;
  budget it (PlanningAlerts' broken-scraper graveyard is the warning).

### Wave 4 — New Zealand, Auckland-first (gate: multi-trade proven in ≥ 2 AU metros)

See §3 — NZ is a real market with an open positioning gap, but it is a
**new-ICP launch**, not a region toggle.

### Deferred indefinitely

WA (140-council scrape), TAS (until PlanBuild completes ~2027), any
"national coverage" marketing claim, and the low-recall trades (electrical,
plumbing, solar, waterproofing standalone).

## 3. New Zealand — what's actually there

**Regulatory:** building consents (Building Act 2004) carry the
trade-relevant work; resource consents are where/whether. **Like-for-like
re-roofing is consent-exempt** (Schedule 1 cl.1 — comparable component,
same position, roof > 15 yrs), consent only for durability failures,
structural-load changes (iron→concrete tile), or substantial structural
replacement. The 2020 exemption expansion removed ~9,000 more consents/yr.
→ **The Sydney-roofing wedge does not transplant to NZ.** RMA replacement
(Planning Bill + Natural Environment Bill, introduced Dec 2025, consenting
targeted ~mid-2026) aims to cut consent volume further; building consents
are untouched but there's no committed national data feed — watch item.

**Data:** no national per-application feed (Stats NZ = monthly aggregates;
MBIE = BCA performance). Council-by-council, but the economics are decent:
Auckland Council sells subscription lists of all building consents issued +
resource consents lodged at **NZ$1,965/yr weekly** — one paid feed covers
~43% of national new-dwelling volume. Christchurch NZ$192/yr. Wellington =
scrape/LGOIMA. Bulk supply agreements are proven (Cotality NZ buys from
Auckland Council).

**Market:** ~2,028 roofing-services business units (Auckland ~513); consent
volumes recovering (39.1k dwellings yr-to-Apr-2026, +16%). Incumbents:
Pacifecon (NZ leads incumbent since 1982, quote-priced, ~24-month
commitments; *strategic alliance* with Cordell — not Hubexo-owned as we'd
assumed), Cordell Connect NZ (Cotality), BCI/Hubexo (bought Building Tender
Services Sep 2025), EstimateOne (free subbie tier). **No cheap self-serve
consent-digest player exists** — the SiteLens-style gap is open in NZ too.

**How to enter (when gated in):** Auckland, one paid feed, and an ICP whose
work *is* consented — new-build/extension-exposed trades (demolition-lite
doesn't map; think structural, cladding/recladding [leaky-building
remediation is consent-required], drainage, pools). Price in NZD at the
same band. Treat it as founding a second company inside the platform:
own discovery (n≥8), own kill switches, own eval set.

## 4. Engineering: what to build so expansion is cheap later

These are the platform seams — worth shaping *now* only where the roofing
build already touches them, otherwise deferred to their wave:

1. **Jurisdiction adapter interface** (Wave 2): formalise what
   `sources.ts` already half-has — `fetchApplications(jurisdiction, since)`
   returning a normalised record (id, authority, address, description,
   value?, dates, pathway, portalUrl). Add `jurisdiction` to
   `DevelopmentApplication` (default `nsw`); timezone-aware digest cron
   (Sunday 18:00 *local*); currency on pricing/value display.
2. **Vertical packs as data, not code** (Wave 1): extract the roofing
   vocabulary, rerank prompt fragment, and development-type filters into a
   versioned pack (`src/verticals/roofing/…`), so trade #2 is a pack + eval
   set, not a fork of `filters.ts`.
3. **(trade, region) subscription model** (Wave 1): a user subscribes to
   one or more (vertical, region-bundle) pairs; one digest per pair. The
   existing `LgaBundleSubscription` generalises to this.
4. **Per-vertical eval gates** (Wave 1): the eval machinery from issue #19
   must be parameterised by vertical — one gold set and one
   precision/recall report per (vertical, jurisdiction).
5. **Waitlist table + landing capture** (Wave 0): trivially small; ship it
   with the current roofing product.
6. **Scraper-fleet observability** (Wave 3): per-source freshness SLOs and
   drift alerts (the `IngestionLog` pattern, extended) before the
   per-council scraper count exceeds ~5.

## 5. What this does to the moat

The compounding assets are the **vertical packs + per-(vertical,user)
labelled feedback + the jurisdiction adapter library**. Each new trade
reuses the pipeline and inherits the eval discipline; each new jurisdiction
reuses every trade pack. Incumbents (Cotality, Hubexo, Pacifecon) still
sell horizontal, sales-led, quote-priced products in every one of these
markets; the self-serve vertical-digest gap we're exploiting in Sydney is
open in Adelaide, Melbourne, Brisbane, and Auckland. The risk is the same
one the wedge doc named: expanding before the first niche pays. Hence the
gates.

## 6. Open items to close before committing a wave

| Item | Owner | Blocks |
|---|---|---|
| PlanSA register license + FeatureServer refresh cadence | human (read terms / email PlanSA) | Wave 2 |
| Development-type enum audit in our stored NSW rows | agent issue (small) | Wave 1 trade pick |
| Demolition vs pools vs civil discovery (n≥8 each, WTP) | human | Wave 1 |
| Auckland Council feed terms (resale/derived-use rights) | human | Wave 4 |
| Pacifecon ownership verification (NZ Companies Register) | human | Wave 4 positioning |
| ACT/NT licensing checks | human | whenever bundled |
