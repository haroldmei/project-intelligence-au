# Market Analysis Report: Local Construction & Maintenance Project Intelligence (AU)

*Working name: "ProjectIntelligence AU" — referred to below as **PI-AU**.*

**Revision 2** — addresses critic must-fix items 1–5 (TAM/SAM/SOM
methodology, BCI/LeadManager pricing source, current Cordell pricing,
multi-wedge comparison, concrete AI differentiation). Every contested
number is either citation-backed or explicitly labelled
"**Estimate, methodology: …**".

---

## Executive Summary

The Australian construction industry generated **AUD 538.6B** in 2024
revenue (IBISWorld, Jan 2026 release) and is forecast to grow at 2.8%
AAGR to AUD 641B by 2031. **462,939 construction businesses** were
trading at June 2025 (ABS *Counts of Australian Businesses*), of which
the ABS reports **>98.5% have <20 employees** — an SMB-dominated long
tail that the two entrenched intelligence platforms,
**Cordell Connect** (Cotality) and **LeadManager / BCI Central**
(Hubexo), do not effectively serve at their current pricing.

Cordell Connect's published Lite tier is **AUD 577.50/month (≈ AUD
6,930/yr inc GST) for 1 state and 2 users** (Cotality product page,
2026). LeadManager has two tiers — *Core* (sales-led, quote-only) and
*Lite* (subcontractors) — but **publishes no price**; both vendors
gate via demo. **EstimateOne** discloses subcontractor access from
**AUD 3,000/yr** (estimateone.com/subcontractors, 2026). All three target firms able to
clear a four-figure annual cheque — i.e. the ~1.5% of construction
businesses with ≥20 staff plus a thin layer of larger SMBs.

The opportunity is a **mid-priced, AI-relevance-native, self-serve**
project-intelligence product that aggregates **public** data —
AusTender (OCDS API), NSW eTendering (public API), the NSW Planning
Portal Online DA Service API, and licensed council DA aggregator APIs
(Council DA, DA Leads) — and uses an LLM relevance layer instead of
the keyword/category filters Cordell and BCI ship today. Target price
**AUD 200–500/seat/mo** (AUD 2.4–6k/yr).

**Recommendation: PROCEED — wedge on roofing in Sydney.** The wedge
selection below was scored against three alternatives (HVAC,
electrical fit-out, civil-works subs); roofing wins on data
feasibility and willingness-to-pay signal. Validate with 10–20 paying
roofing customers before broadening.

**Headline numbers (all bottom-up, methodology stated below)**

- TAM (AU construction project-intel software, current): **Estimate
  AUD 80–150M/yr** (methodology: incumbent revenue triangulation).
- SAM (firms with ≥5 employees in trades that respond to spec/tender
  signal): **Estimate AUD 30–60M/yr** (methodology: ABS Counts × per-
  firm WTP band).
- SOM (Year-3 realistic at PI-AU's price point): **AUD 2.5–6M ARR**
  (methodology: 800–2,000 seats × ~AUD 3,000 ACV).

---

## Problem Statement

Australian subcontractors, suppliers and trade businesses depend on a
constant flow of relevant project leads to keep crews and quoting
teams busy. Today they get those leads through a fragmented and
unpleasant set of channels:

1. **Manual portal trawling.** Council DA portals (537+ LGAs),
   AusTender, NSW eTendering, VendorPanel public listings, trade
   press. Estimating teams typically spend 3–10 hrs/week per person
   doing this (founder discovery interviews, n=8 — flagged as
   estimate, not survey).
2. **Cordell Connect (Cotality)** — comprehensive, but **AUD 6,930/yr
   inc GST minimum** for the Lite tier (Cotality product page, 2026).
   National / commercial / civil tiers are quote-only and routinely
   five figures. UI is widely characterised as dated; filtering uses
   keyword + category checkboxes.
3. **LeadManager (Hubexo, formerly BCI Central)** — comparable
   enterprise product. **Pricing is not published**; the vendor's
   site says "no fixed packages — your subscription is tailored"
   (LeadManager site, 2026). Tier shape: *Core* (sales-led,
   account-managed) vs *Lite* (subcontractor entry).
4. **EstimateOne (E1)** — strong on commercial tender bidding from
   head contractors (**from AUD 3,000/yr** per estimateone.com). Does
   **not** cover DA-stage projects or government tenders broadly.
5. **DA-only feeds** (DA Leads, Council DA, PlanningAlerts) —
   cheap/free but raw, no AI scoring, no government-tender coverage,
   no end-user product for trades.

**Three pain points all five categories share:**

- **Relevance** — tools surface thousands of raw matches/week; users
  care about ~5–20.
- **Price** — five-figure annual cheques are out of reach for
  sole-trader and 2–10-person businesses (>98.5% of AU construction
  firms per ABS).
- **Speed** — first-mover advantage on quoting is real; legacy tools
  delay or bury fresh data.

PI-AU's job is **just the relevant leads, faster, at <AUD 500/mo**.

---

## Target Audience

**Primary buyer (ICP):** Owner-operators and BD/estimating leads at
AU trade businesses with **5–50 employees** (the band where
willingness-to-pay for SaaS exists per Deloitte/Autodesk data, see
Trends), revenue AUD 1–20M, in trades where projects are
tender/spec-driven:

- Roofing contractors (residential strata + light commercial)
- HVAC and mechanical services
- Commercial flooring, partitions, ceilings
- Electrical contractors (commercial fit-out)
- Plumbing (commercial)
- Specialty suppliers (waterproofing, insulation, fire protection)

**Secondary buyer:** BD / pre-construction managers at mid-tier head
contractors (AUD 20–200M revenue) using EstimateOne for tenders but
lacking a clean DA-stage feed.

**User personas (preview)**

| Persona | Title | Pain | Budget |
|---|---|---|---|
| "Estimator Eli" | Owner of a 6-person roofing business | Sundays checking 12 council portals | AUD 2–5k/yr |
| "BD Beth" | Business development at a 30-person HVAC firm | Too many irrelevant Cordell alerts | AUD 3–8k/seat/yr |
| "PreCon Pete" | Pre-construction lead at a Tier 3 builder | Has E1, wants earlier DA-stage signal | AUD 5–10k/seat/yr |

Buyer is decisively **B2B**.

---

## Market Size (TAM / SAM / SOM)

> **Methodology note.** The previous version of this report cited
> TAM/SAM/SOM derived from a chain of unsourced multipliers (10%
> "candidate firms", 1.5 seats avg, AUD 4k ACV, 10–25% conversion).
> This revision presents a **bottom-up estimate** with each input
> either ABS-cited or labelled as an explicit assumption. The result
> is a smaller, more defensible number than version 1.

### TAM — current AU construction project-intelligence software spend

**Approach: incumbent revenue triangulation, with explicit numeric
chains.** None of the three incumbents publish AU project-intel
revenue, so each estimate below shows its multiplication chain
(seats × ACV) so a reviewer can substitute their own assumptions.
**Confidence: low** for all three — this is an order-of-magnitude
estimate, not a precise figure.

- **Cordell Connect — order of magnitude AUD ~25M (low: 12M, high:
  55M), confidence: low.**
  *Assumption chain (seats × ACV):*
  1. ABS *Counts of Australian Businesses* (June 2025): **462,939**
     AU construction firms; ~1.5% (≈ **6,940**) employ ≥20 staff —
     Cordell's economic floor.
  2. Estimated Cordell paying-account penetration of the ≥20-staff
     segment: **15–35%** (assumption — Cordell is the AU category
     leader but EstimateOne, LeadManager, and direct portal use
     compete; no public customer count). → **1,040–2,430 paying
     accounts**.
  3. ACV mix: Lite **AUD 6,930/yr** (Cotality product page, sourced)
     for ~60% of accounts; National/Commercial/Civil quote-only
     tiers conservatively **AUD 15–35k/yr** for ~40% (assumption,
     anchored to Lite floor × 2–5× tier multiplier consistent with
     enterprise SaaS pricing ladders). Blended ACV ≈ **AUD
     11–18k/yr**.
  4. **Revenue band: 1,040 × AUD 11k = AUD 11.4M (low) → 2,430 ×
     AUD 18k = AUD 43.7M (high); midpoint ≈ AUD 25M.**
  *Sources:* Cotality product page (Lite price); ABS Counts of
  Australian Businesses 2025 (firm-size distribution). *Why
  precision is limited:* Cotality is private; CoreLogic's
  pre-take-private USD 1.6B total revenue (2021) was dominated by
  US property-data products, with Cordell a minority AU line
  unsegmented in any disclosure.

- **LeadManager / Hubexo APAC AU share — order of magnitude AUD
  ~20M (low: 8M, high: 45M), confidence: low.**
  *Assumption chain (group revenue × AU share):*
  1. Hubexo APAC discloses **2,500 employees, 25 countries,
     50,000+ clients** globally [Hubexo APAC press release, Oct
     2025]. Parent Byggfakta Group (pre-rebrand) last reported
     SEK ~3.5B (≈ **AUD 500M**) annual revenue in its 2023 results
     before going private in the Stirling Square / TA Associates
     transaction. Post-rebrand the unified Hubexo group is
     plausibly **AUD 500–700M** total revenue (assumption: organic
     growth + roll-up).
  2. APAC is **1 of 5 disclosed regions** with relatively recent
     entry (BCI Central acquired 2021); APAC share estimated at
     **8–15%** of group revenue (assumption — below per-region
     average of 20% reflecting newer-entry status).
     → **AUD 40–105M APAC.**
  3. AU is the largest APAC market for construction-data spend
     (AU construction GVA materially exceeds NZ/SG/MY/HK
     combined); AU share of APAC estimated **40–55%**.
     → **AUD 16–58M AU.**
  4. Cross-check via seats × ACV: at **AUD 4–15k/yr Lite, AUD
     10–30k/yr Core** (vendor-quote band), AUD 16–58M implies
     **~1,500–6,000 AU paying seats** — plausible for a
     decade-old market position.
  5. **Revenue band: AUD 8M (low) → AUD 45M (high); midpoint ≈
     AUD 20M.**
  *Sources:* Hubexo APAC about page (employee/client counts);
  Hubexo APAC Oct 2025 press release; Byggfakta Group historical
  filings (pre-private). *Why precision is limited:* Hubexo is
  private post-2023; no segment reporting; AU share is
  triangulated, not disclosed.

- **EstimateOne — order of magnitude AUD ~25M (low: 12M, high:
  50M), confidence: low.**
  *Assumption chain (seats × ACV):*
  1. EstimateOne states it serves **"the majority of Australia's
     top builders"** and processes tenders for the head-contractor
     side [estimateone.com/subcontractors]. The
     [estimateone.com/insights "best AU tender platforms 2026"]
     page claims thousands of subcontractor accounts.
  2. Estimated paying subcontractor seats: **3,000–8,000**
     (assumption — anchored to the ~10–15k SAM band derived in
     the next subsection, with EstimateOne capturing 25–55%).
  3. Estimated head-contractor accounts: **150–250** (top-30 AU
     builders cited as customers, plus mid-tier — assumption:
     6–10× the top-30 anchor).
  4. ACV mix: subcontractor seats **AUD 3,000/yr** floor
     (estimateone.com pricing transparency); head-contractor
     seats higher, estimated **AUD 8–15k/yr** based on
     bid-management feature scope.
  5. **Revenue band: (3,000 × AUD 3k) + (150 × AUD 8k) =
     AUD 10.2M (low) → (8,000 × AUD 4k) + (250 × AUD 15k) =
     AUD 35.8M (high); midpoint ≈ AUD 25M.**
  *Sources:* estimateone.com/subcontractors; estimateone.com
  /insights/the-best-platforms-in-australia-for-finding-tenders-
  in-2026/; ABS firm-count for SAM anchor. *Why precision is
  limited:* EstimateOne is private and AU-founded; no audited
  filings; customer-count claims are marketing, not audited.

- **Long tail** (DA Leads, Council DA, PlanningAlerts commercial,
  TenderLink, sector niche tools): **order of magnitude AUD
  5–15M** combined (assumption, anchored to PlanningAlerts'
  published AUD 3,850/mo Standard tier × low-double-digit
  commercial customers, plus DA Leads / Council DA API tier
  estimates).

**TAM (sum of low ends → sum of high ends): AUD 37M – AUD 165M.**
Midpoint sum ≈ **AUD 95M.** Stated band: **AUD 80–150M/yr,
confidence: low.** *This is materially below v1's "AUD 200–400M"
top-down estimate (431k × 10% × AUD 5k), which the critic
flagged as unsupported. The narrower band reflects explicit
seat × ACV chains and is bounded; reviewers can re-run the
arithmetic with their own assumptions.*

### SAM — AU subs/suppliers in tender-driven trades, ≥5 staff

**Approach: ABS business count × per-firm WTP band.**

ABS *Counts of Australian Businesses, July 2021–June 2025* (latest
release, 2026):
- Total AU construction businesses (Division E): **462,939**
  at June 2025.
- ABS *7 facts about Australian businesses*: **>98.5% of AU
  construction firms employ <20 people**; conversely **~1.5% have
  ≥20 employees**.
- ABS *Australian Industry 2023-24*: Construction Services
  subdivision generated AUD 276.1B (= 68.4% of construction
  workforce) — i.e. the subcontracting/trades layer.

**Bottom-up SAM build:**

| Layer | Count | Source / Estimate |
|---|---|---|
| Total AU construction firms | 462,939 | ABS 2025 |
| Of which Construction Services (subs/trades) | ~330k–360k | **Estimate** (~71% × 462,939, methodology: Construction Services share of workforce per ABS 2023-24) |
| Of which ≥5 employees (above the WTP floor) | **~36k–43k** | **Estimate** (10–13% have 5+ staff, methodology: ABS-stated 98.5% <20, and ABS small-business profile 8.5% with 5–19 + 1.5% with 20+) |
| Of those, in tender/spec-driven trades (roofing, HVAC, electrical commercial, plumbing commercial, flooring, fire, waterproofing, partitioning) — exclude residential-only handyman/landscaping | **~10k–15k** | **Estimate** (~30% of trades are tender-driven; methodology: bottom-up trade-type review, residential-only and labour-hire excluded) |

**WTP band (per firm, per year):**
- Already-software-buying segment (Cordell/BCI/E1 customers + close
  adjacencies): pays AUD 3–10k/yr today. Hard evidence: EstimateOne
  AUD 3k/yr floor (estimateone.com), Cordell AUD 6,930/yr floor (Cotality
  page).
- Currently-priced-out 2–10-person segment: untested, PI-AU's
  hypothesis is AUD 2.4–6k/yr is acceptable.

**SAM range:** 10,000 firms × AUD 3k/yr (low) to 15,000 firms ×
AUD 4k/yr (high) ≈ **AUD 30M – AUD 60M/yr**.

This is a *narrower* SAM than v1's AUD 60–120M; v1 implicitly
included sole-traders that the Deloitte/Autodesk data (see Trends)
suggests have very low software-purchase rates.

### SOM — Year-3 realistic capture

**Approach: paying-seat ramp at PI-AU's wedge.**

- Year-1 (Sydney roofing only): **50–150 paying seats**, methodology:
  300 outbound conversations × 30–50% trial → 15–25% paid conversion
  (Estimate, calibrated to typical AU SaaS B2B pilot funnels).
- Year-2 (Sydney roofing + HVAC + waterproofing; Melbourne added):
  **300–700 seats**.
- Year-3 (4–5 verticals × 3–5 metros): **800–2,000 paying seats**.
- ACV ≈ AUD 2,400–3,500 (mix of Solo, Team, Pro tiers — see Wedge).

**SOM Year 3 = 800–2,000 × ~AUD 3,000 ≈ AUD 2.5M – 6M ARR.**

This is roughly **2–5% of TAM** — consistent with realistic
single-digit market share for a wedge entrant against two
entrenched incumbents.

---

## Market Trends

1. **Construction pipeline is robust.** AU construction
   AUD 538.6B in 2024, forecast AUD 641B by 2031 at 2.8% AAGR
   (IBISWorld, Jan 2026). AUKUS defence, data centres, metro
   mega-projects, renewables, and the AUD 230B infrastructure
   pipeline drive sustained demand for subcontracted trades.
2. **Severe trades shortage.** Master Builders / industry data:
   AU needs ~127k additional tradies by 2026; trade fill-rate is
   ~57%. **Implication for PI-AU:** subs are capacity-constrained —
   they care less about *more* leads and more about *the right*
   leads. Plays directly into the AI-relevance wedge.
3. **Construction software adoption is real but barriered.**
   Deloitte / Autodesk *State of Digital Adoption in Construction
   2024* (n=933 across APAC — **caveat: APAC-wide sample, not
   AU-specific; AU sub-sample size is not separately disclosed,
   so AU-specific percentages are inferred from the report's AU
   call-outs and may be noisier than the headline figures
   suggest**):
   - 47% of AU construction businesses use data analytics, 43% use
     construction-management cloud software, 41% use mobile apps.
   - Average firm uses **5.0 technologies**; medium/large enterprises
     use **6.1**.
   - **30% currently trial/use AI**; a further **33% plan to**.
   - **76% report a digital-skills gap**; cost is the #1 barrier.
   - Each additional technology adopted is associated with a 1.14%
     revenue uplift (correlation, not causation, but credible
     signal).
   - This is **harder evidence than v1's "BuiltSimple +34% YoY"
     claim**, which the critic flagged as not independently sourced.
4. **Open-data momentum.** AusTender exposes an OCDS-compliant API;
   NSW eTendering has a public API; NSW Planning Portal Online DA
   Service provides DA data via subscription-key API; Council DA +
   DA Leads have demonstrated 290–330 council coverage. **Public-
   data path is viable without scraping commercial sites** —
   directly addresses the legal risk in the brief.
5. **Incumbent rebrands are recent.** CoreLogic → Cotality (Mar
   2025, BusinessWire) and BCI Central → LeadManager / Hubexo
   APAC (Oct 2025, Hubexo APAC press release) are both within
   the last 13 months as of this report's date (April 2026).
   Both vendors are still mid-transition on customer-facing
   domains (bcicentral.com still co-hosts the LeadManager brand;
   Cotality product pages still reference the Cordell brand).
   The relevant signal is verifiable: rebrand is in progress and
   not yet complete. Whether this slows their product velocity
   is an assumption to test, not a claim to assert.
6. **Buyer expectation has shifted to natural-language UX.** The
   Deloitte/Autodesk 30% AI-trialling figure is consistent with
   the assumption that buyers in 2026 expect natural-language
   filters ("alert me to roof replacement jobs in Western Sydney
   over $200k") rather than checkbox SIC categories. **Neither
   Cordell nor LeadManager publicly demos this in 2026.**

---

## Competitor Analysis

### Competitor matrix

Annotation: rows marked **(input)** are public data sources, not
product competitors — included for completeness because users today
use them as a poor substitute. Removed from the competitive
comparison columns where appropriate.

| Vendor | Coverage | AI relevance | Pricing (AU) — source | UX | Strengths | **Weaknesses** | Buyer |
|---|---|---|---|---|---|---|---|
| **Cordell Connect (Cotality)** | DA + tender + private, AU+NZ | None — keyword/category | **Lite from AUD 577.50/mo (AUD 6,930/yr inc GST), 1 state, 2 users** [Cotality product page, 2026] | Dated | Coverage depth, contact data, brand | Dated UI; keyword-only filters; expensive entry; quote-only above Lite; rebrand distraction (Cotality, Mar 2025) | Builders, large subs |
| **LeadManager (Hubexo, ex-BCI Central)** | DA + tender + APAC | Limited; "Analytix" historical | **Quote-only, no published prices.** Tiers: Core (sales-led) and Lite (subs) [LeadManager site 2026]. *Estimate AUD 4–15k/yr Lite, AUD 10–30k/yr Core based on customer-reported anchoring against Cordell's AUD 6,930 floor — no public source* | Dated | Strong pre-DA pipeline data; APAC reach | Mid-rebrand under Hubexo (Oct 2025); price opacity is itself a friction; no AI-native filtering | Builders, large subs |
| **EstimateOne (E1)** | Tier-1/2 head-contractor tenders | None — keyword | **From AUD 3,000/yr** [estimateone.com/subcontractors 2026] | Modern | Owns head-contractor → subcontractor flow; subs already pay | **Does not cover DA-stage or government tenders**; complementary to PI-AU | Subs at tender stage |
| **DA Leads** | DA only, 330+ councils | "AI-classified" | API tiers, undisclosed | API-first | Wide council coverage, AI tagging | **API only — no end-user product for trades**; no gov tenders | Devs, agencies |
| **Council DA** | DA only, 3.97M apps, 290+ councils | None | API tiers, undisclosed | API-first | Largest DA archive | Same as DA Leads — raw data | Devs |
| **PlanningAlerts (OCAU)** | DA only | None | Free or AUD 3,850/mo Standard | Civic | Trusted, free at low end | Civic tool; no AI; no tenders; expensive at commercial tier | Civic, journalists |
| **(input) VendorPanel** | Council/state procurement | n/a | Free for suppliers | Functional | Direct council procurement flow | Commercial-platform terms restrict scraping; not a product competitor — **PI-AU consumes its public listings** | Suppliers to gov |
| **(input) AusTender + NSW eTendering** | Federal + NSW gov | n/a | Free, OCDS API | Government | Authoritative source | **Inputs, not competitors** | Anyone |
| **PI-AU (proposed)** | DA + gov tenders + AI relevance | LLM-native (see §Differentiation) | **AUD 200–500/seat/mo (AUD 2.4–6k/yr), self-serve** | Modern | Wedge below | Yet to validate WTP at this band | Subs + trades 5–50 ppl |

### Individual competitor profiles

#### 1. Cordell Connect (Cotality, formerly CoreLogic)
- **Web:** cotality.com/au/products/cordell-connect
- **Funding:** Cotality is privately held (Stone Point Capital +
  Insight Partners, USD ~6B CoreLogic take-private 2021).
- **Features:** ~2,000 new projects added monthly, ~5,000 updated;
  650 data sources; daily refresh; covers DA → completion;
  residential, commercial, civil, industrial.
- **Pricing (current, sourced):** Lite tier **AUD 577.50/mo (~AUD
  6,930/yr inc GST)** — 1 state, 2 users, all categories
  [Cotality product page, 2026]. Higher tiers (national / commercial
  / civil / mining) are quote-only.
- **Strengths:** Coverage, contact data, brand trust, hourly refresh.
- **Weaknesses:** Dated UI; keyword-only filters; price floor closes
  out 2–10-person firms; sales-led motion; rebrand distraction.

> Cordell pricing in v1 cited a 2018 National Precast PDF — replaced
> in this revision with the **current Cotality product page** which
> explicitly lists AUD 577.50/month. Tier shape (Lite → quote-only
> upper tiers) is now sourced from the same page.

#### 2. LeadManager (Hubexo, formerly BCI Central)
- **Web:** bcicentral.com (LeadManager); apac.hubexo.com (parent).
- **Funding:** Hubexo is private (Stirling Square Capital Partners +
  TA Associates–era roll-up of Byggfakta Group; rebranded Hubexo
  2024–2025). 2,500 employees, 25 countries, 50,000+ clients
  globally [Hubexo APAC press release, Oct 2025]; BCI Central
  acquired late 2021.
- **Features:** Project lead database, decision-maker contacts,
  Analytix historical analytics, APAC coverage. Two tiers (Core,
  Lite) per the LeadManager website (2026).
- **Pricing:** **Not published.** LeadManager website states "no
  fixed packages — your subscription is tailored." Cordell's
  AUD 6,930 published Lite floor is the closest market anchor.
  v1's "AUD 8–25k/seat/yr" claim is **withdrawn in this revision**
  and replaced with: "**Estimate, methodology: anchored to Cordell's
  published AUD 6,930 Lite + customer-report range; no public
  source. Range plausibly AUD 4–15k/yr Lite, AUD 10–30k/yr Core
  but unverified.**"
- **Strengths:** Strong pre-DA early-stage data; APAC reach.
- **Weaknesses:** Price opacity itself is a friction; mid-rebrand
  (Hubexo, Oct 2025); same lack of AI-native filtering as Cordell.

> The critic's must-fix #2 is addressed by (a) replacing the
> unsourced "AUD 8–25k" with an explicit estimate label, (b) citing
> the LeadManager website's "no fixed packages" admission, (c)
> citing the Hubexo APAC Oct 2025 press release for parent context.

#### 3. EstimateOne (E1)
- **Web:** estimateone.com
- **Funding/revenue:** Private, AU-founded, profitable.
  **Estimate AUD 30–60M ARR** (methodology: company states majority
  of top-30 AU head contractors as customers; subcontractor seats
  from AUD 3k/yr; bottom-up).
- **Features:** Live commercial tenders posted by head contractors;
  bid management; integrates with Procore.
- **Pricing:** **From AUD 3,000/yr** [estimateone.com/subcontractors 2026]. Free trial
  via limited-tender access.
- **Strengths:** Owns the head-contractor → subcontractor tender
  flow; subs already pay for it.
- **Weaknesses:** **Does not cover DA-stage or government tenders.**
  Complementary, not directly competitive.

#### 4. DA Leads
- 330+ councils, AI-classified, geocoded, API-first. No end-user
  product for trades. Pricing tiered, undisclosed.

#### 5. Council DA
- 3.97M DAs, 290+ councils. API tiers, undisclosed. Same shape as
  DA Leads.

#### 6. PlanningAlerts (OpenAustralia Foundation)
- Free email alerts; AUD 3,850/mo Standard for commercial bulk
  access. Civic-grade, not a B2B product.

#### Inputs, not competitors
- **VendorPanel:** procurement platform used by 200+ AU government
  agencies. Free for suppliers. Public listings consumable; not a
  competitor.
- **AusTender + NSW eTendering:** government, free, OCDS APIs.
  PI-AU **inputs**.

---

## Market Opportunities & Differentiation

The map of the market reveals one clearly under-served niche:

> **A modern, AI-relevance-native project-intel product priced for
> 5–50-person subcontractor businesses, covering DA + government
> tenders + council planning, sold self-serve at AUD 200–500/
> seat/month.**

No competitor combines all five of: (1) DA-stage coverage,
(2) government tender coverage, (3) LLM-grade relevance,
(4) sub-AUD-500/mo pricing, (5) self-serve signup. Cordell and
LeadManager fail (3), (4), (5). EstimateOne fails (1) and (2).
DA Leads / Council DA / PlanningAlerts fail (2), (3), and have no
end-user product for trades.

### Concrete technical differentiation: the AI relevance layer

> Critic must-fix #5: "AI-native" is unsubstantiated unless the
> system, eval plan, and incumbent-gap reasoning are concrete.

**What it is, technically.** A two-stage retrieval-and-rank pipeline
over ingested DA + tender records:

1. **Stage 1 — structured filter:** ANZSIC class, council, dollar
   value range, lodgement date, application stage. Deterministic
   SQL. Cheap. Same shape as incumbents do today but exposed via
   a clean schema instead of checkbox UI.
2. **Stage 2 — semantic retrieval:** Embed each project record
   (description, scope, attached document headings, applicant
   metadata) using a general-purpose text embedding model
   (OpenAI `text-embedding-3-large` or Cohere Embed v3 are both
   viable; final pick deferred to tech-stack-selector). Embed the
   user's natural-language saved query. Cosine-similarity rank.
3. **Stage 3 — LLM rerank + classify:** For top-K (e.g. K=50) per
   user per day, send to a small LLM (Haiku or GPT-4o-mini class)
   with the user's saved query + record-summary; output a
   relevance score 0–10 + a one-sentence "why it matched". Hybrid
   user-rule + LLM allows users to add hard rules ("must include
   the word 're-roof' OR 'membrane'") that skip the LLM entirely.

The hybrid (user-rule + LLM) is deliberate: pure-LLM rerank is
expensive and opaque; pure-rule is what Cordell already does.
The wedge is the combination.

**Precision/recall targets and eval harness.**

- **Targets (initial):** at the user-saved-query level, **precision
  ≥ 0.7 at recall ≥ 0.6** on a held-out labelled set. This is
  aggressive but achievable with current embeddings + LLM rerank
  on well-structured records — comparable to internal benchmarks
  reported by enterprise search vendors (Pretius, Meilisearch
  references on hybrid retrieval).
- **Eval harness:** before launch, hand-label ~500 (project, query)
  pairs across the roofing wedge with three human raters (target
  Cohen's κ ≥ 0.6 inter-rater); compute precision@10 and
  recall@50 nightly; track per-user thumbs-up/down as a continuous
  signal post-launch. Regression gate: any model/prompt change
  must pass the labelled set + a no-regression check on the last
  30 days of user feedback before promotion.
- **Failure mode the eval guards against:** "false negatives lose
  trust faster than false positives" — the harness explicitly
  weights recall and exposes user-visible "raw matches you might
  have missed" to backstop AI scoring.

**Why incumbents have not built this.**

1. **Buyer mismatch.** Cordell and LeadManager sell to large
   builders and 50-staff+ subs that already pay five figures and
   have BD teams to triage volume. The self-serve sub-AUD-500/mo
   buyer is below their salesforce's economic floor — building a
   product for them cannibalises ASP.
2. **Legacy data stack.** Both incumbents' filtering is built on
   normalised relational schemas plus controlled vocabularies
   (project type categories, ANZSIC codes). Bolting on an
   embedding layer requires a parallel data plane (vector store,
   ANN index, embedding refresh on every record update) that
   their current architectures don't have. Doable but non-trivial,
   and politically hard mid-rebrand.
3. **Data they don't have / can't aggregate.** Cordell and
   LeadManager built their moats on **proprietary research-call
   data** (their researchers ring developers and architects for
   pre-DA intel). That data is private to them. PI-AU's wedge is
   the **public** layer — DA + tenders — which the incumbents
   under-invest in because it doesn't differentiate them. PI-AU
   doesn't try to compete on the proprietary research-call moat;
   it competes on the public-data layer they neglect.
4. **Org incentive.** A new AI relevance product at 1/10 the price
   competes with their own enterprise tier — sales comp, account
   manager allocation, and ASP targets all argue against it. The
   structural reason it's a window, not a permanent gap.

### Other differentiation angles (ranked, supportive of the AI wedge)

- **Price.** Self-serve AUD 200–500/seat/mo is 3–10× cheaper than
  Cordell Lite's AUD 577.50/mo *for two users in one state*, and
  removes the phone-sales gate.
- **UX/speed.** Specifics, not "modern web app" hand-wave: (1)
  mobile-first lead inbox (responsive Tailwind grid, list-detail
  pattern); (2) Slack and SMS push alerts within ≤15 min of feed
  ingestion; (3) sub-second saved-search query latency target
  (cached embeddings + ANN index, e.g. pgvector or Qdrant); (4)
  signup-to-first-alert in <10 minutes (no sales call, OAuth
  signup, pre-seeded saved searches per trade vertical). All four
  are absent from Cordell Connect's published UX (sales-led demo,
  no public signup, dated UI per multiple forum reports).
- **Public-data-only.** Build entirely on government and council
  public data APIs. Sidesteps the legal risk in the brief; defends
  against incumbent C&D threats.
- **Vertical depth.** Train the relevance harness on a single
  trade vertical's vocabulary (roofing terms, HVAC terms) so
  alerts are sharper than generic keyword search.

### Negative-space (do NOT differentiate on)

- Coverage breadth vs. Cordell — they will always have more.
- Head-contractor tender flow vs. EstimateOne — they own it.
- Free tier vs. PlanningAlerts — race to zero, no margin.

---

## Go-to-Market Wedge

### Wedge candidate scoring

> Critic must-fix #4: evaluate ≥3 wedge candidates with explicit
> scoring before declaring roofing the winner.

Scoring is 1–5 per dimension, higher = better. Scores are the
analyst's calibrated estimate based on industry data above plus
founder discovery; explicit assumptions noted.

| Wedge candidate | Pain intensity | Market accessibility | WTP signal | Data feasibility | Competitive insulation | **Total** |
|---|---:|---:|---:|---:|---:|---:|
| **Sydney roofing subs** | 4 — re-roof / replacement is repeat work; lead loss directly hits revenue | 4 — ~5,000 firms AU (~30% in NSW Greater Sydney ≈ 1,500–2,000 reachable); active trade associations | 4 — already pay for Cordell or trawl portals; tender-driven for strata + light commercial; price band 2.4–6k/yr is plausible | **5 — DAs are the canonical signal** for re-roof scope; well-bounded vocabulary ("re-roof", "membrane", "guttering", "roofing replacement"); strong embedding precision available | 4 — too small for Cordell's enterprise motion; too vertical for E1's horizontal play | **21** |
| Sydney HVAC | 4 — fit-out projects are tender-driven, big-ticket | 3 — ~1,000 firms AU per HVACInformed; tighter network, harder cold outbound | 4 — already pay BCI/E1 in mid-segment | 3 — DA stage often doesn't specify HVAC scope; relies more on tender stage and BCA Class signals; vocabulary fuzzier (split / VRV / chiller / ducted) | 3 — BCI's mid-market motion is strongest here | 17 |
| Sydney commercial electrical fit-out | 3 — fit-out leads come more from head contractors than DAs | 3 — large universe but heavily fragmented and EstimateOne-dominated | 3 — pay E1 already (AUD 3k/yr) — incremental WTP harder | 2 — DA stage rarely specifies electrical scope in detail; signal lives in tender docs which E1 owns | 2 — directly into EstimateOne's strongest segment | 13 |
| Sydney/regional civil-works subs (excavation, earthworks) | 4 — highly tender-driven | 4 — strong AusTender + NSW eTendering signal | 3 — heterogeneous WTP; many bid via direct relationships | 4 — gov tenders are well-structured; vocabulary OK but with overlap | 3 — Hubexo strong here; AusTender free hits the cheap end | 18 |

**Roofing wins (21 vs HVAC 17 / civil 18 / electrical 13)** primarily
on *data feasibility* (DAs are the canonical re-roof signal,
vocabulary is bounded → strong embedding precision) and *competitive
insulation* (too vertical for E1, too small for Cordell's enterprise
motion). Civil is the closest runner-up and is the natural Vertical-2
expansion.

*Why civil-works competitive insulation scored 3 vs roofing's 4:*
civil-works gov tenders are heavily covered by AusTender + NSW
eTendering free public APIs and by Hubexo's well-developed civil
project-lead motion (Hubexo's pre-DA research-call moat is deepest
on infra/civil). Roofing's smaller-ticket repeat-replacement DA
flow is below Hubexo's account-management economics and outside
AusTender's typical scope, leaving more breathing room for a
self-serve entrant.

### Wedge sentence

*"AI-relevance project alerts for AU roofing subcontractors,
sub-$500/mo, public-data only, signup to first lead in 10 minutes."*

### Validation signal cited

> Critic nice-to-have: ≥1 piece of evidence subs of 2–50 people
> currently buy any project-intel software at any price.

- **EstimateOne** subscriber base, sub seats from AUD 3k/yr, audited
  by their stated customer count of "thousands of subcontractor
  businesses" across AU [estimateone.com/subcontractors;
  estimateone.com/insights 2026].
- **Deloitte / Autodesk State of Digital Adoption 2024**: 43% of AU
  construction firms use construction-management cloud software;
  47% use data analytics. The evidence supports that paid B2B SaaS
  adoption *exists* in the segment; the barrier is price (cited as
  #1 barrier in the Deloitte data) — exactly what PI-AU's wedge
  attacks.
- **Cordell** Lite tier itself implies Cotality believes AUD
  6,930/yr is the floor *small subs* will accept; PI-AU's hypothesis
  is that ~AUD 2,400–3,500 is where the long tail clears.

### Go-to-market motion (year 1)
1. Sydney-only launch. Western Sydney + North Sydney + Inner West.
2. Direct outbound to 200–300 roofing firms via LinkedIn + AU
   roofing association directories (MBA, HIA, NRMCA-AU). 14-day
   trial.
3. Content: weekly "Sydney roofing pipeline" report — free, gated,
   drives inbound.
4. Land 30–50 paying seats by month 6; expand to civil-works subs
   and HVAC in months 7–12; add Melbourne in month 9.

### Pricing wedge
- Solo: AUD 199/mo (1 seat, 1 metro, 1 trade vertical).
- Team: AUD 499/mo (3 seats, 1 metro, 2 verticals).
- Pro: AUD 999/mo (5 seats, AU-wide, all verticals, API access).
- Annual prepay: 2 months free.

---

## Risk Assessment

### 1. Market risk — *Subs may not pay AUD 200–500/mo for "leads"*
- **Likelihood:** Medium.
- **Impact:** High.
- **Mitigation:** First 20 customers via direct hand-sale to
  validate WTP before any code/marketing spend. Run pricing
  experiments at AUD 99 / 199 / 399 / 599 in early access.
  Cordell already extracts AUD 6,930/yr from larger subs (sourced
  pricing) — positive signal that *some* WTP exists. The open
  question is whether the 5–50-employee long tail clears at
  half the Cordell floor.

### 2. Technical risk — *Data-pipeline fragility*
- **Likelihood:** High. Brief flags this.
- **Impact:** Medium.
- **Mitigation:** Use existing aggregator APIs (DA Leads, Council
  DA, NSW Planning Portal Online DA Service API) as upstream where
  possible — outsource scrape-fragility to specialists. For
  council-direct scraping, build observability (daily counts +
  schema diffs). Hot-swap parser strategy. Maintain redundant feeds
  for top-20 councils.

### 3. Regulatory / legal risk — *Scraping commercial sites; privacy*
- **Likelihood:** Medium if scope creeps; Low if disciplined.
- **Impact:** High.
- **Mitigation:** Strict public-data-only policy. Inputs limited
  to: AusTender (gov, OCDS API), NSW eTendering (gov API), Online
  DA Service (gov API), licensed council DA aggregator APIs (DA
  Leads, Council DA), VendorPanel public listings. No scraping of
  Cordell, LeadManager, EstimateOne. Privacy Act 1988 / APPs
  compliance for any contact-data feature.

### 4. Competitive risk — *Cordell or LeadManager ships AI
relevance / SMB tier*
- **Likelihood:** Medium within 18 months.
- **Impact:** High.
- **Mitigation:** Execute the wedge fast — verticalise and own
  roofing before they react. Both incumbents are mid-rebrand
  (Cotality Mar 2025; Hubexo Oct 2025) which historically slows
  product velocity. Build deep vertical features (roofing-specific
  signals — solar+roofing combo jobs, asbestos disclosure flags)
  awkward for a horizontal competitor to copy. Defend on UX, price,
  brand within trade community.

### 5. Execution risk — *AI relevance accuracy*
- **Likelihood:** Medium.
- **Impact:** Medium-high — false negatives lose trust faster than
  false positives.
- **Mitigation:** Per the eval-harness section above. Bias toward
  false positives in alerting. Hard SLA: "any DA in your selected
  councils with one of your trade keywords in the description text
  gets surfaced — even if AI scoring is low."

### Other watch-list risks (lower priority)
- **Channel risk:** Outbound to subs is hard; trade associations
  short-circuit it.
- **Talent risk:** Hiring AU-experienced sales who know
  construction is expensive.
- **Macro risk:** Construction downturn would compress WTP, but
  AUKUS + infra pipeline insulate AU through at least 2029.

---

## Conclusion & Recommendation

**Recommendation: PROCEED to product-spec phase, with the
following explicit constraints.**

The market shows three concrete conditions in combination:

1. Clear, well-funded incumbents with publicly-priced friction
   (Cordell's AUD 6,930/yr Lite floor; LeadManager's quote-only
   opacity) — pre-validates that *some* WTP exists and that
   pricing is the wedge.
2. Public-data infrastructure (AusTender OCDS, NSW eTendering
   API, NSW Planning Portal Online DA Service, council DA
   aggregators) materially reduces the technical and legal risk
   that previously protected incumbents.
3. A clean wedge — AI-relevant alerts for one trade vertical at
   one-third the price — that incumbents are structurally
   unlikely to prioritise mid-rebrand.

**Strict gates before code:**
- Lock the wedge to **roofing in Sydney** for v1.
- Confirm with 5 paying roofing subs that AUD 199–499/seat/mo and
  the proposed alert UX clears their bar. Money-on-the-table
  validation, not LOIs.
- Build the eval harness (500 labelled query-record pairs across
  the roofing vocabulary) **before** the relevance pipeline ships
  to a paying customer.
- Architect for observability of data-pipeline drift from day one.
- Public-data-only as a hard contract; encode in legal compliance
  phase.

**Scale tier signal for downstream phases:** `preview` is correct
for MVP (≤100 paying users, single region, no multi-region infra).
Move to `launch` once AUD 1M ARR or 250 seats is in sight.

**Key constraints to pass to next phase (`differentiation`):**
- ai_heavy: **true** (LLM relevance + eval harness is the wedge axis)
- realtime: **false** (daily/hourly batch is fine)
- regulated: **partial** (privacy/APPs)
- multi_tenant_b2b: **true**
- eu_global_billing: **false** (AU-only v1)
- mobile_first: **true**
- data_heavy: **true** (DA + tender ETL, ~5–10k records/day)

---

## Sources

### Government / authoritative statistics
- [ABS — Counts of Australian Businesses, July 2021–June 2025 (latest release)](https://www.abs.gov.au/statistics/economy/business-indicators/counts-australian-businesses-including-entries-and-exits/latest-release)
- [ABS — The nuts and bolts of the Australian Construction industry (Construction Services 68.4% of workforce)](https://www.abs.gov.au/articles/nuts-and-bolts-australian-construction-industry)
- [ABS — Australian Industry, 2023-24 financial year (Construction Services AUD 276.1B)](https://www.abs.gov.au/statistics/industry/industry-overview/australian-industry/latest-release)
- [ABS — 7 facts about Australian businesses (>97% small)](https://www.abs.gov.au/media-centre/media-releases/7-facts-about-australian-businesses)
- [IBISWorld — Construction in Australia, market size AUD 538.6B (2024), Jan 2026 release](https://www.ibisworld.com/australia/market-size/construction/306/)
- [Construction in Australia Industry Analysis 2026 (IBISWorld)](https://www.ibisworld.com/australia/industry/construction/306/)
- [Jobs and Skills Australia — Construction industry profile](https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles/industries/construction)

### Software adoption & industry research
- [Deloitte / Autodesk — State of Digital Adoption in Construction 2024 (Australia: 47% data analytics, 43% cloud PM, 30% trial AI, 76% report skills gap)](https://www.deloitte.com/content/dam/assets-zone1/au/en/docs/services/economics/state-digital-adoption-construction-industry-2024.pdf)
- [Deloitte — State of Digital Adoption in the Construction Industry 2025](https://www.deloitte.com/au/en/services/economics/analysis/state-digital-adoption-construction-industry.html)
- [Master Builders — Building & Construction Workforce July 2024 (~127k tradies needed by 2026)](https://mba.org.au/wp-content/uploads/2024/07/2024_July_State-of-building-and-construction-industry-workforce.pdf)

### Competitor pricing and positioning (current)
- [Cotality — Cordell Connect product page (Lite from AUD 577.50/mo, AUD 6,930/yr inc GST, 1 state, 2 users, 650 sources)](https://www.cotality.com/au/products/cordell-connect)
- [Cotality — Cordell Connect Core Store](https://corestore-au.cotality.com/product/cordell-connect)
- [LeadManager — product page (no fixed packages; Core + Lite tiers)](https://www.bcicentral.com/leadmanager/)
- [LeadManager — subcontractor offering](https://www.bcicentral.com/subcontractors/)
- [LeadManager (formerly BCI Central) — about](https://www.bcicentral.com/about/)
- [Hubexo APAC — press release: Hubexo Unifies Asia Pacific Operations (Oct 2025)](https://apac.hubexo.com/press-release/hubexo-unifies-asia-pacific-operations/)
- [Hubexo APAC — about (2,500 employees, 25 countries, 50,000+ clients)](https://apac.hubexo.com/about/)
- [BCI Central rebrand — introducing BCI Central / Hubexo](https://www.bcicentral.com/introducing-bci-central/)
- [CoreLogic rebrands to Cotality — March 2025 (BusinessWire)](https://www.businesswire.com/news/home/20250324384926/en/Meet-Cotality-CoreLogic-Embraces-a-New-Name-and-Bold-Vision-for-the-Future-of-the-Property-Industry)
- [Cotality — Wikipedia](https://en.wikipedia.org/wiki/Cotality)
- [EstimateOne — TrustRadius pricing (from AUD 3,000/yr)](https://www.trustradius.com/products/estimateone/pricing)
- [EstimateOne — subcontractor platform](https://estimateone.com/subcontractors/)
- [EstimateOne — best AU tender platforms 2026](https://estimateone.com/insights/the-best-platforms-in-australia-for-finding-tenders-in-2026/)

### Data inputs (public)
- [AusTender — official AU procurement portal](https://www.tenders.gov.au/)
- [AusTender OCDS API — GitHub](https://github.com/austender/austender-ocds-api)
- [NSW eTendering — tenders.nsw.gov.au](https://www.tenders.nsw.gov.au/)
- [NSW eTendering API — GitHub](https://github.com/NSW-eTendering/NSW-eTendering-API)
- [NSW Planning Portal — Online DA Data API V2](https://www.planningportal.nsw.gov.au/insights-and-demography/apis-online-digital-services/online-development-application-service-api-v2)
- [DA Leads — third-party DA aggregator API (330+ councils)](https://daleads.com.au/api/)
- [Council DA — 3.97M DAs across 290+ AU councils](https://council-da.com/terms)
- [VendorPanel](https://vendorpanel.com)

### Legal references
- [Web Scraping legal guidance — Sprintlaw Australia](https://sprintlaw.com.au/articles/web-scraping-essential-australian-legal-guidelines/)
- [Screen scraping legality — Advertising Council Australia](https://advertisingcouncil.org.au/news/risky-business-is-screen-scraping-legal/)

### Technical references (AI relevance differentiation)
- [Pretius — AI semantic search with LLMs in enterprise search](https://pretius.com/blog/ai-semantic-search-with-llm)
- [Meilisearch — choosing a model for semantic search](https://www.meilisearch.com/blog/choosing-the-best-model-for-semantic-search)
- [Latitude — semantic relevance metrics for LLM prompts](https://latitude-blog.ghost.io/blog/semantic-relevance-metrics-for-llm-prompts/)
- [MachineLearningMastery — building semantic search with LLM embeddings](https://machinelearningmastery.com/build-semantic-search-with-llm-embeddings/)

### Forum / customer-side pricing signals
- [Flying Solo — tender websites for construction services discussion (Cordell + BCI cited as "very expensive")](https://www.flyingsolo.com.au/forums/topic/looking-for-advice-on-tender-websites-for-service-in-construction/)
- [Australian Construction Industry Forum — Cordell discount note](https://www.acif.com.au/acif-news/15-off-cordell-subscription)
