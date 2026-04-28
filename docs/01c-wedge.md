# Wedge & Differentiation — ProjectIntelligence AU (PI-AU)

## Date: 2026-04-28
## Status: LOCKED

---

## 1. The Six Forcing Questions

### 1.1 Who, exactly?

**The owner-operator of a 4–15-person Sydney roofing subcontractor business
(residential strata + light commercial), revenue AUD 1.5–8M/yr, who personally
quotes work or supervises one estimator.** They have ABN, are a member of MBA
NSW or HIA, and hold a Roofing Tiling licence (Class RT) or Roof Plumbing
licence. The trigger event is **Sunday night** — the owner is in their ute or at
the kitchen table, opening a fourth council DA portal trying to find next
week's quotable jobs while their crew sits idle waiting for the schedule.

ICP location: Greater Sydney (Western Sydney, Inner West, Hills, Northern
Beaches, Sutherland Shire) — ≈ 1,500–2,000 reachable firms (NSW share of the
~5,000 AU roofing-business universe).

Concrete trigger: a re-roof / membrane / metal-deck replacement DA was lodged
at one of ~15 LGAs in the past 7 days that this firm could quote on — and
they currently have no efficient way to find it.

### 1.2 What do they do today?

A typical Tuesday afternoon for "Estimator Eli", owner of a 6-person Western
Sydney roofing firm:

- **2:00 pm** — finishes a site visit in Penrith, drives back to the depot.
- **2:45 pm** — opens his laptop, logs into Penrith Council DA Tracker,
  searches "roof" in the past 14 days, scrolls 80 results, mostly granny flats
  and pergolas. Copies one promising lot address into a notepad.
- **3:10 pm** — repeats for Blacktown DA portal (different UI, different
  search syntax). Then Parramatta. Then Cumberland. Then The Hills.
- **4:30 pm** — gives up on the last 8 LGAs because it's quoting time.
- **5:00 pm** — opens email, finds a Cordell Connect alert: 47 new "roofing"
  matches across NSW. Of the 47, maybe 3 are real re-roof opportunities in
  his service area; the rest are new-build slab-on-ground listings, hospital
  fitouts in Newcastle, or aluminium cladding tenders. He files all 47 in a
  folder called "lookatlater" and never opens it again.
- **5:45 pm** — calls his BD-aware mate at a roofing supplier and asks "got
  any leads?" — half his pipeline still comes from that one phone call.
- **Sunday 9:00 pm** — does a second pass of council portals because the
  good ones get quoted by Wednesday morning and he was too late last week.

He pays Cordell AUD 6,930/yr (Lite tier) and gets ~3 useful leads/week from
it; he calculates that's about AUD 44 per useful lead, plus 6 hours/week of
his own time triaging the noise. He does not pay for LeadManager (quote-only,
no demo time) or EstimateOne (head-contractor focus, doesn't surface DA-stage
re-roof work).

### 1.3 What would they pay for today (no AI required)?

A **Sunday-night email and SMS** that arrives by 7 pm with a curated list of
**5–15 roofing-relevant DAs lodged this week across the LGAs they nominated**,
each with: address, scope summary, estimated dollar value, applicant name,
direct portal link, and a one-line "why this is a re-roof job".

He would pay this **without any LLM in the loop** — a competent human
researcher producing the same list manually would clear his bar at AUD
199–399/mo. Evidence:

- He already pays Cordell AUD 577.50/mo for a worse version of this (broader,
  noisier, no Sunday-night cadence).
- EstimateOne pulls AUD 3,000/yr for a *different* product (head-contractor
  tenders) — proves the segment buys SaaS at the AUD 250–500/mo band.
- Discovery (founder n=8) anchors WTP at AUD 200–500/seat/mo.

This matters because it means the wedge is **not "AI"** — the wedge is
**curated relevance for one trade in one metro, at one-third the price**.
The AI is how we deliver curation cheaply at scale; it is not the value prop
the buyer pays for.

### 1.4 The narrowest possible first version

> A weekly digest of roofing-relevant DAs across 15 Sydney LGAs, delivered
> Sunday 6 pm by email + SMS, gated behind a 60-second self-serve signup at
> AUD 199/mo.

That's it. One trade vertical. One metro. One push channel. One price.

V1 is **not**: a dashboard, a CRM, a contact-data bolt-on, a multi-vertical
filter, a tender feed, a head-contractor flow, a mobile native app, a
team-seat plan, or an API. All of those are `[V2]` or later.

One engineer's sentence: "ETL the NSW Planning Portal API + 15 council DA
feeds into a Postgres table, embed the description, rank against a fixed
roofing-vocabulary saved query, push the top 5–15 hits per user per week."

### 1.5 The single observation no incumbent has acted on

**Cordell, LeadManager, and EstimateOne all sell horizontally — every trade,
every region, every project stage — because their cost-of-sale model requires
a buyer big enough to consume the whole catalogue. None of them ship a
single-trade, single-metro, self-serve product, because doing so cannibalises
their enterprise ASP.**

The non-obvious corollary: **public DA data + a vertical-trained relevance
layer is enough to beat their horizontal "all-trades" filter on precision, in
that one vertical, by a wide margin** — because the incumbents' relevance is
constrained by their need to serve every buyer with the same taxonomy
(ANZSIC + keyword categories). They cannot afford to bake roofing-specific
vocabulary ("re-roof", "Colorbond replacement", "membrane upgrade", "asbestos
roof removal", "solar-ready") into their ranking, because doing it for one
trade obligates them to do it for forty.

The window: both Cordell (Cotality, Mar 2025) and LeadManager (Hubexo, Oct
2025) are mid-rebrand. Mid-rebrand vendors do not ship vertical SKUs.

### 1.5b Defensibility against new entrants (not just incumbents)

The incumbent-disincentive argument above only blocks Cordell / LeadManager /
EstimateOne; it does **not** block a new entrant, a trade-association
member-service play (e.g. MBA NSW shipping a portal), or a horizontal tool
slapping on a "Sydney roofing" preset. The roofing-vocabulary layer itself is
replicable in days, not months. We acknowledge this and rely on two
*compounding* mechanisms instead of vocabulary novelty.

**(a) Quantified feedback-loop / cold-start moat.** Per-user thumbs feedback
on each Sunday digest produces labelled (DA, relevant?) pairs at a known
rate. With 5–15 cards/week × ~80% thumb-rate (observed in similar
B2B-SMB curated-digest products), each active user generates ≈ 8–12
labelled pairs/week. After 4–6 weeks of normal usage that is **N ≈ 200–400
labelled pairs per active user**, enough to fine-tune the per-user
relevance reranker and lift personal-precision a measurable few points
above the cold-start global model (the AI section's launch-gate baseline is
≥ 0.7 precision at ≥ 0.6 recall on the 500-pair global eval set; per-user
fine-tune is targeted at +5–10 points on top of that). A clone shipping in
week 0 with **zero labelled thumbs per user** would need the same 4–6 weeks
of live usage **per user** to catch up. By the time the clone reaches week-4
parity for a given user, PI-AU has 8–12 weeks more data on that same user
(plus aggregated cross-user vocabulary signal), so the gap widens, not
closes. The clone cannot buy this data — it is per-user thumb history that
exists only inside our product.

**(b) Time-bounded moat — honesty hedge.** We acknowledge the moat is
*bounded*. Cordell's rebrand window plausibly closes in 12–18 months; after
that they may ship a vertical SKU, and a well-funded new entrant could in
principle replicate the vocabulary layer in a fortnight. The defensibility
plan therefore is: **(i)** get to 100 paying Sydney roofing customers in 12
months, **(ii)** compound feedback-loop labelled data such that per-user
precision lift is statistically meaningful by month 3 of each customer's
tenure, and **(iii)** when an incumbent or clone enters the vertical, the
founder's defensibility shifts from technical novelty to *distribution +
label depth + brand* — i.e. the trade-network familiarity, the ~1,500–2,000
direct outbound relationships, and the "the Sunday roofing email" mindshare
that a fast-follower cannot conjure in week 1. Kill switch 5.3 is the
fall-back: if a credible single-vertical clone ships before we hit 100
paying customers, we pivot to vertical #2 (civil-works subs) and reuse the
same public-data + feedback-loop machinery.

This is what we do *not* claim:

- We do not claim the vocabulary layer is novel. It is replicable.
- We do not claim a structural data-network effect across users in week 1.
  The cross-user moat compounds; it is not present at launch.
- We do not claim distribution is already in place. Cold outbound to MBA NSW
  and HIA member directories is the plan, not a current asset.

### 1.6 10× not 10%

Not "better leads". Concretely:

| Metric | Cordell Connect (status quo) | PI-AU wedge | Multiple |
|---|---:|---:|---:|
| Cost per useful weekly lead | ~AUD 44 (AUD 577.50/mo ÷ ~13 useful/mo) | ~AUD 4 (AUD 199/mo ÷ ~50 useful/mo, after curation) | **~10×** |
| Owner triage time per week | 6 hours (portal trawl + Cordell triage) | 5 minutes (read Sunday digest) | **~70×** |
| Time from DA lodgement to alert | 24–72 hours, buried in 47-item email | <24 hours, top of a 5–15 item digest | **~5×** |
| Signup-to-first-relevant-lead | Days (sales call → demo → quote → contract) | <10 minutes (self-serve, OAuth, pre-seeded saved search) | **>100×** |

The headline 10× is **owner triage time per week** (70× reduction from 6
hours to 5 minutes). Cost-per-useful-lead is the ROI proof. Time-to-alert is
the trust-builder. Signup-time is the distribution unlock.

None of these answers is `WEAK`.

---

## 2. Chosen Axis

## Chosen Axis: **Niche** (depth-for-niche, the narrowest ICP owned end-to-end)

## Rationale

Considered axes (rejected):

- **Price** — yes, PI-AU is 3× cheaper than Cordell. But "we are cheaper" is
  a feature, not a wedge — Cordell can match a SMB tier in 6 months if they
  decide to. Price is the *consequence* of the wedge, not the axis.
- **Speed** — yes, alerts arrive faster. But the buyer's pain is not "I get
  alerts late" — it is "I get 47 alerts and 3 are useful." Speed without
  relevance is just more noise. Reject.
- **Depth** — close, but "depth" implies a deep product across many features
  for one buyer. PI-AU is deliberately *shallow* across features (one
  workflow) and deep across *one trade's vocabulary*. That's Niche, not
  Depth.
- **Integrations / Distribution / Design / Data network effects / Trust** —
  none are the structural unlock. Each is a downstream tactic.

**Chosen: Niche.** PI-AU wins by being the *only* product that does one thing
— Sunday-night roofing DA digest in Sydney — better than any horizontal
incumbent ever can, because the horizontal incumbents structurally cannot
verticalise to one trade without breaking their enterprise ASP. The 10× on
owner-triage-time (70×) only exists because we refuse to serve any buyer who
isn't a Sydney roofer; that refusal is the moat.

What this costs us: TAM is small in V1 (≈ 1,500–2,000 reachable firms ×
~AUD 2,400 ACV ≈ AUD 4.8M ceiling for the Sydney-roofing slice). We accept
that — owning a niche end-to-end at AUD 1–2M ARR is a defensible base from
which to add vertical #2 (civil-works subs in Year 2) and vertical #3 (HVAC
in Year 3).

## 3. Anti-axis

**We will NOT compete on coverage breadth, on head-contractor tender flow, on
multi-trade horizontal filters, on contact-data depth, or on free-tier
race-to-zero.** Specifically:

- We will **not** ship a multi-trade filter in V1, even if a customer asks.
- We will **not** add HVAC, electrical, plumbing, flooring, fire, or
  waterproofing leads to the Sydney-roofing customer's digest. Cross-trade
  expansion is a *separate* product launch, not a feature toggle.
- We will **not** ship contact-data enrichment (architect/applicant phone
  numbers) — that is Cordell's moat, not ours.
- We will **not** build head-contractor → subcontractor tender flow — that
  is EstimateOne's moat.
- We will **not** offer a free tier. Free trains buyers that the digest is
  worth zero. 14-day full-access trial only.
- We will **not** geographically expand beyond Sydney in V1, even if a
  Melbourne roofer signs up. They go on a waitlist.

This anti-axis is the permission slip: every later skill that asks "should
we build X" answers itself by checking whether X serves the Sydney-roofing
Sunday-digest workflow. If not, deferred to V2.

---

## 4. Wedge Workflow (≤ 10 steps)

The single workflow, narrated as Estimator Eli would experience it:

### Step 1 — Eli signs up

- **Inputs:** email, mobile number, ABN, NSW roofing licence number,
  payment card.
- **Output:** an account with a default saved search "Roofing — Greater
  Sydney" pre-seeded across 15 LGAs.
- **Today's pain:** Cordell takes 3–10 business days, gated behind a sales
  call and a quote-only contract.
- **Our 10×:** <60 seconds, no sales call, no contract negotiation. Card on
  file, 14-day trial.

### Step 2 — Eli refines his service area

- **Inputs:** a list of LGAs from a checkbox list, optionally a postcode
  radius around his depot.
- **Output:** a saved search scoped to his actual service area (e.g.
  Western Sydney + Hills, not all NSW).
- **Today's pain:** Cordell defaults to whole-of-state; refining to LGAs
  requires a UI walk through dated checkbox trees.
- **Our 10×:** Two clicks. Pre-seeded LGA bundles ("Western Sydney",
  "Inner West", "Sutherland + St George") that match how a roofer thinks.

### Step 3 — System ingests fresh DAs nightly

- **Inputs:** NSW Planning Portal Online DA API + 15 council aggregator feeds
  (DA Leads, Council DA APIs).
- **Output:** ~500–1,500 new DAs/week stored, each with description,
  applicant, value, lodgement date, scope.
- **Today's pain:** Eli is the ETL — he opens 4 portals manually each Sunday
  and gives up on the other 11.
- **Our 10×:** Eli stops doing the portal-trawl entirely. The system
  hits portals he was never going to check (e.g. Camden, Wollondilly).

### Step 4 — Relevance layer scores each DA against the roofing vocabulary

- **Inputs:** ingested DA records + a roofing-specific saved-query embedding +
  vocabulary rules ("re-roof" OR "membrane" OR "Colorbond" OR "asbestos roof"
  OR "guttering replacement" OR …).
- **Output:** a ranked list of the top 5–15 DAs/LGA-bundle/week, each with
  relevance score 0–10 and a one-line "why this matched" ("Existing dwelling
  re-roof, membrane upgrade, est. AUD 180k").
- **Today's pain:** Cordell ships Eli 47 keyword matches; he triages 6 hours
  to find 3 real re-roofs. Precision is roughly 6%.
- **Our 10×:** Target precision ≥ 70% at recall ≥ 60% on the labelled set.
  Eli reads 12 items, 8 are real re-roofs. ≈ 11× precision lift.

### Step 5 — Sunday 6 pm digest fires

- **Inputs:** the week's ranked top-K DAs, Eli's email + SMS preferences.
- **Output:** an email with 5–15 cards (address, value, scope, applicant,
  portal link, "why this matched") and an SMS with the top-3.
- **Today's pain:** Cordell emails are realtime fire-hose; nothing fits the
  Sunday-evening quoting cadence; SMS is not offered.
- **Our 10×:** A single, scannable, time-anchored digest matching how owners
  actually quote (Sunday night for the week ahead). No fire-hose mode.

### Step 6 — Eli reads the digest in 5 minutes

- **Inputs:** the digest in his inbox / phone.
- **Output:** a thumbs-up/down on each card; the ones he wants get added to a
  "this week's quotes" list.
- **Today's pain:** 47-item Cordell email gets foldered, never opened again.
- **Our 10×:** 5–15 items, scannable in 5 minutes, mobile-first card layout
  he can review in the ute on Monday morning.

### Step 7 — Eli clicks through to the council portal

- **Inputs:** a click on the DA card.
- **Output:** a deep link to the original council DA page with attached
  documents (architectural drawings, scope of works, statement of
  environmental effects).
- **Today's pain:** He'd have to navigate the council portal manually from
  scratch.
- **Our 10×:** One click, no portal hunt. The DA is the source of truth; we
  do not re-host it (legal hygiene).

### Step 8 — Eli marks the lead "quoted" or "passed"

- **Inputs:** a thumb on the card.
- **Output:** feedback signal back into the relevance layer (this user's
  thumbs improve next week's ranking; aggregated thumbs improve the global
  vocabulary).
- **Today's pain:** No feedback loop in any incumbent product.
- **Our 10×:** Per-user feedback closes the loop. Each thumbs-down is a
  precision improvement; each thumbs-up is a recall confirmation.

### Step 9 — Weekly auto-recap

- **Inputs:** Eli's last 4 weeks of thumbs + which DAs he saw vs missed
  (held-out manual labels by us).
- **Output:** a "you saw 38 of 41 real re-roof DAs this month, top precision
  93%" stat at the top of next Sunday's digest.
- **Today's pain:** No proof in any incumbent that "the leads I got were the
  right leads."
- **Our 10×:** We *prove* the wedge weekly. This is the renewal driver — it
  is also the eval-harness output reframed as customer-facing trust.

### Step 10 — Renewal at month 12

- **Inputs:** card on file, 12 months of digest history.
- **Output:** auto-renewal at AUD 199/mo (AUD 1,990/yr with annual-prepay 2
  months free).
- **Today's pain:** Cordell renewals are sales-led, friction-laden,
  surprise-priced.
- **Our 10×:** Frictionless renewal. The 12-month digest history is its own
  retention argument.

If "Our 10×" looks the same on every step, the axis is wrong. Here it
varies meaningfully: signup speed, vocabulary depth, cadence design,
feedback loop, transparency. All are facets of the **Niche** axis — owning
one trade end-to-end means we tune every step to that trade's actual rhythm.

---

## 5. Kill Switches

### 5.1 Demand kill
**If fewer than 10 of the first 50 outbound-contacted Sydney roofing firms
agree to pay AUD 199/mo for a 14-day trial within 8 weeks of launch, kill.**
This is the WTP test for the long-tail segment Cordell prices out. 20%
trial-payment conversion is below industry average for cold outbound; if we
can't clear that, the niche doesn't have the WTP we hypothesised.

### 5.2 Build kill
**If the wedge workflow (signup → saved search → ingest → rank → Sunday
digest → click-through) cannot be delivered end-to-end with precision ≥ 0.6
at recall ≥ 0.5 on the labelled set within 10 weeks of code start, reduce
scope to a *manual-curation* digest (researcher writes it weekly) and
re-evaluate AI relevance in V1.5.** Manual curation at AUD 199/mo is still
viable margin for the first 50 customers; it just delays the AI moat.

### 5.3 Defensibility kill
**If Cordell or LeadManager publicly ships an "AI-relevance, sub-AUD-300/mo,
single-vertical SKU" before PI-AU has 100 paying Sydney roofing customers,
pivot to vertical #2 (Sydney civil-works subs).** Vertical #2 is pre-scored
in the market analysis (total 18 vs roofing's 21) and uses the same
public-data infrastructure. We keep the public-data + vertical-vocabulary
moat; we lose the first-mover roofing claim.

### 5.4 Eval-harness kill
**If after 4 weeks of model iteration the precision/recall on the 500-item
labelled roofing set cannot exceed Cordell's keyword-baseline by ≥ 3×,
revert to "curated by a part-time human researcher" and remove all AI
positioning from the landing page.** False positives that lose trust kill
faster than slower-shipping AI.

---

## 6. Constraints for downstream phases

### product-spec
- The MVP user-story map MUST contain **exactly one critical flow**:
  *"As a Sydney roofing owner-operator, I receive a curated Sunday 6 pm
  email + SMS digest of 5–15 relevant DAs lodged in my LGAs this week, and
  click through to the source portal in one tap."*
- Max 3 supporting flows: (a) self-serve signup with card-on-file and LGA
  scoping; (b) per-DA thumbs feedback that improves ranking; (c)
  monthly recap stat ("you saw N of M real re-roofs"). Anything else →
  `[V2]`.

### analyst
- FRs that do not directly serve the Sunday digest flow MUST be tagged
  `[Out-of-wedge]` and dropped from V1. Specifically: NO multi-trade
  filters, NO contact-data enrichment, NO head-contractor tender feed, NO
  team-seat hierarchy beyond a single user, NO API access in V1, NO
  Melbourne/Brisbane support.

### designer
- Architecture decisions MUST be justified against the wedge. The cheapest
  architecture that delivers a Sunday digest wins. **No microservices.** A
  single Postgres + a single ingestion worker + a single web app + a single
  weekly cron is the ceiling of complexity until 100 paying customers.
- Vector store: pgvector inside the same Postgres, not a separate Qdrant
  cluster, until query latency is provably the bottleneck.

### ux-designer
- The home screen MUST make the wedge legible within 5 seconds: the
  Sunday-digest preview is the hero. Hero microcopy = the wedge sentence.
- Mobile-first card layout for the digest, because the user reads it on
  the phone in the ute. Desktop is the secondary surface.

### auth-engineer
- Email + SMS magic-link auth or password + OTP. **No SSO**, no Google
  Workspace, no enterprise IDP. Single-user accounts only in V1.

### backend-developer / frontend-developer
- If a feature does not appear in the wedge workflow OR the supporting
  flows, do not build it, even if it would be "easy."
- The Sunday 6 pm cron is the highest-availability code path. It must
  fail loud and re-fire; everything else can degrade.

### ai-features
- The relevance layer is the only AI in V1. Hybrid (rule + embedding +
  LLM rerank). Eval harness with 500 labelled (project, query) pairs is a
  prerequisite to GA. Per-user thumbs feedback is the live signal.
- Token-cost ceiling: AUD 0.50/user/month on AI inference at 5,000 DAs/week
  ingested. Above that, the unit economics break.

### landing-page
- Hero headline = the wedge sentence (Section 8), verbatim.
- Sub-headline = the 70× owner-triage-time claim with the cost-per-useful-
  lead comparison (AUD 44 → AUD 4) as the evidence.
- Three feature blocks max, each tied to a step of the wedge workflow:
  (1) "15 Sydney LGAs, one Sunday email" → step 5; (2) "Re-roof, membrane,
  asbestos: trained on roofing language, not keywords" → step 4; (3) "Sign
  up in 60 seconds, no sales call" → step 1.

### pricing
- Tier structure MUST reflect the **Niche** axis: a single, generous, single-
  user tier at AUD 199/mo (Solo) and a small-team tier at AUD 499/mo (Team,
  3 seats, same Sydney-roofing scope). **No "Pro" tier with multi-vertical
  or multi-metro in V1** — that contradicts the wedge.

### legal-compliance
- Public-data-only contract is binding. No scraping of Cordell, LeadManager,
  EstimateOne, or any commercial site under terms-of-use restriction.
- Privacy Act 1988 / APPs compliance for any contact-data feature (none
  in V1, but stub the consent UX).

### deployer / cicd / infra
- Scale tier = `preview` (see Section 7). No Terraform. No multi-region.
  Vercel or Fly preview-tier for the web app. Buildkite for CI per the
  project default.

### dogfood
- The dogfood test is "can I, the founder, click through the Sunday
  digest in under 5 minutes and find at least one DA I'd quote?" If
  no, the wedge is not shipped.

---

## 7. Scale Tier

## Scale Tier: **preview**

V1 targets ≤ 100 paying Sydney roofing customers (kill switch 5.1 caps it
at 100 before pivoting). At AUD 199–499/mo and 100 customers, ARR is in
the AUD 240–600k band — well below the threshold for multi-region infra,
SOC2, or enterprise SLAs. The market analysis explicitly recommends
`preview` (sourced: doc/01 §Scale tier signal). Move to `launch` only when
either (a) 250 paying seats are in sight or (b) AUD 1M ARR is in sight.

The orchestrator must skip background-jobs (beyond the single weekly cron),
env-manager (single .env is enough), CI/CD (Buildkite default is fine),
infra Terraform (preview deploy targets only), observability beyond Sentry
+ a single uptime check, and production-readiness review until tier
upgrades.

---

## 8. One-Sentence Wedge Statement

> **The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.**

(133 characters, < 140.)

Every later skill MUST embed verbatim:

`<!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds. -->`

---

## Stack constraints

```yaml
realtime: false           # weekly Sunday digest cadence; no live cursors, presence, or websockets
ai_heavy: true            # embedding + LLM-rerank relevance is the 10× delivery mechanism for the niche
regulated: false          # public DA data; no PHI, no PCI beyond Stripe-handled card; APPs are light-touch
multi_tenant_b2b: false   # single-user accounts in V1; Team tier (3 seats) is a flat seat list, not real multi-tenancy
eu_global_billing: false  # AU-only V1; AUD pricing; GST handled by Stripe AU
mobile_first: true        # owner reads the digest on his phone in the ute; mobile is the primary surface
data_heavy: false         # ~5,000–10,000 DA records/week ingested; well within Postgres + pgvector on a single node
```

Justifications for each `true`:

> `ai_heavy: true` — the wedge axis is Niche, and the 10× on owner-triage-
> time (70×) depends on the relevance layer (embeddings + LLM rerank trained
> on roofing-specific vocabulary) outperforming Cordell's keyword filter by
> ≥ 3×. The eval harness (500 labelled pairs, precision ≥ 0.7 at recall
> ≥ 0.6) is a launch gate, not a stretch goal. Pulls in `ai-features`
> phase.

> `mobile_first: true` — the Sunday digest is read on a phone in a ute or
> at the kitchen table by an owner-operator, not at a desk. Card layout,
> SMS push, and tap-to-open-portal are first-class UX. Desktop is
> secondary. Forces Tailwind responsive-first, viewport-first design.

All other constraints default to `false` per the wedge's deliberate
narrowness.

---

## Self-critique gate

- **Could a competitor copy in a weekend?** Against incumbents, no —
  Cordell can ship a SMB pricing tier in a quarter, but they cannot ship
  roofing-vocabulary vertical relevance without obligating themselves to do
  it for forty trades; their architecture and sales motion both fight
  against it. Against a new entrant or a horizontal tool adding a Sydney-
  roofing preset, the vocabulary layer *is* replicable in days, and we do
  not claim otherwise. The compounding moat is the per-user thumbs
  feedback loop (≈ 200–400 labelled pairs per active user by week 4–6;
  zero for any clone shipped today) plus the bounded 12–18-month window
  to compound distribution, label depth, and brand before incumbents
  rebrand-rebuild — see Section 1.5b for the math, the limits, and the
  fall-back (kill switch 5.3).
- **If we remove the Niche axis, does the product still win?** No. Without
  Niche, PI-AU is "another horizontal project-intel tool, slightly
  cheaper" — Cordell crushes that in 6 months. The wedge is structurally
  load-bearing.
- **"We'll be better" instances?** Audited and rewritten. Every claim is
  measurable: 70× triage-time, AUD 4 vs AUD 44 cost-per-useful-lead,
  precision ≥ 0.7 at recall ≥ 0.6, < 60s signup, < 24h alert latency,
  Sunday 6 pm cadence.
- **Mom test on the wedge sentence?** "The Sunday-night roofing DA digest
  for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60
  seconds." A Sydney roofer hearing this cold leans in: it names his
  trade, his city, his Sunday-night ritual, his price band, and the
  friction (signup) he's been burned by. Pass.

Status: **LOCKED**.
