# Product Specification — ProjectIntelligence AU (PI-AU)

<!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds. -->

**Date:** 2026-04-28
**Status:** DRAFT — critic required before lock
**Scale tier:** preview
**MVP scope:** Critical flow + 3 supporting flows; everything else tagged `[V2]`

---

## 1. Vision Statement

ProjectIntelligence AU exists to give Sydney roofing owner-operators the one
thing Cordell Connect cannot: a curated, 5–15-item Sunday-night digest of
roofing-relevant development applications lodged across 15 Greater Sydney LGAs
that week, delivered by email and SMS, at one-third the price of the incumbent,
with signup in under 60 seconds and no sales call. Every product decision in V1
is justified by a single question: does this make Estimator Eli's Sunday night
5 minutes instead of 6 hours? If not, it is `[V2]`.

---

## 2. User Personas

### Persona 1 — "Estimator Eli" (Primary ICP)

| Field | Detail |
|---|---|
| **Name** | Eli Papadopoulos |
| **Role** | Owner-operator, 6-person Western Sydney roofing firm |
| **Revenue** | AUD 2.8M/yr (strata re-roof + light commercial) |
| **Location** | Penrith, NSW; services Western Sydney, Hills, Parramatta LGAs |
| **Age** | 42 |
| **Tech proficiency** | Medium — iPhone-first, uses Xero for invoices, Airtable for quoting pipeline; avoids anything requiring setup time |
| **Current tools** | Cordell Connect Lite (AUD 6,930/yr), Google Maps, word-of-mouth from suppliers |
| **Goals** | Fill crew schedule 6–8 weeks ahead; hit AUD 3.5M in year 2; stop personally doing DA portal trawls |
| **Pain points** | Cordell sends 47 alerts/week, 3 are real re-roofs in his area; Sunday-night portal trawl costs 2+ hours; no feedback mechanism to improve alerts; renewals are a sales-call hostage situation |
| **Quote** | *"I pay Cordell nearly seven grand a year and I still spend Sunday night checking Penrith DA Tracker manually. If someone sent me a clean list of re-roofs every Sunday I'd pay $200 a month without blinking."* |

---

### Persona 2 — "Growth-Stage Gabby" (Secondary ICP, Team tier)

| Field | Detail |
|---|---|
| **Name** | Gabby Nguyen |
| **Role** | Operations Manager / estimator at a 14-person Inner West roofing firm; reports to the owner |
| **Revenue** | Firm at AUD 5.5M/yr; Gabby manages 2 estimators |
| **Age** | 35 |
| **Tech proficiency** | High — uses Monday.com, comfortable with SaaS onboarding |
| **Goals** | Systematise lead capture so she isn't the bottleneck; produce weekly pipeline reports for the owner |
| **Pain points** | LeadManager demo never happened (quote-only), EstimateOne doesn't cover DA-stage work; Cordell noise drowns her estimators |
| **Quote** | *"I need my estimators spending time quoting, not Googling council portals. Give me a curated list every Monday morning and I'll sort the quotes myself."* |

---

### Persona 3 — "Sole-Trader Steve" (Edge ICP — validates price floor)

| Field | Detail |
|---|---|
| **Name** | Steve Okafor |
| **Role** | Sole trader, roof plumber; 1-person operation, Sutherland Shire |
| **Revenue** | AUD 280–400k/yr |
| **Age** | 29 |
| **Tech proficiency** | Medium-low — iPhone only; hates desktop UIs |
| **Goals** | Find 3–4 re-roof jobs/month to stay booked; no estimator, quotes himself on-site |
| **Pain points** | Can't afford Cordell; manually checks Sutherland Shire DA tracker twice a week; misses jobs because strata managers call other roofers first |
| **Quote** | *"If it's on my phone and costs me less than a skip bin hire, I'm in."* |

> **Note:** Steve is not the primary V1 buyer — his per-seat ROI math is tighter. He
> validates the AUD 199/mo price floor but the activation / retention model
> targets Eli and Gabby. Steve's conversion to paying is a bonus; his trial
> data is signal.

---

### Persona 4 — "BD Beth" (Out-of-wedge V1; in-wedge V2)

| Field | Detail |
|---|---|
| **Name** | Beth Andersen |
| **Role** | Business development at a 30-person HVAC firm |
| **Age** | 38 |
| **Pain points** | Too many irrelevant Cordell alerts; HVAC scope rarely explicit at DA stage |
| **V1 status** | **Not served in V1.** HVAC vertical is wedge #2. Beth goes on a waitlist. |
| **Quote** | *"When you cover HVAC, call me."* |

---

### Persona 5 — "PreCon Pete" (Out-of-wedge V1; in-wedge V3+)

| Field | Detail |
|---|---|
| **Name** | Pete Stavros |
| **Role** | Pre-construction lead at a Tier 3 builder (AUD 80M/yr) |
| **Age** | 47 |
| **Pain points** | Has EstimateOne for tenders, wants earlier DA-stage signal; needs multi-trade visibility |
| **V1 status** | **Not served in V1.** Multi-trade + head-contractor flow is `[V2]`. Pete goes on a waitlist. |

---

## 3. User Story Map

### Critical Flow (CF-1) — Sunday-Night Roofing DA Digest

> **Exactly one critical flow, per wedge constraint.**
>
> *"As a Sydney roofing owner-operator, I receive a curated Sunday 6 pm email + SMS
> digest of 5–15 relevant DAs lodged in my LGAs this week, and click through to
> the source portal in one tap."*

---

#### Epic CF-1: Weekly Digest Delivery

##### Story CF-1.1 — Nightly DA ingestion
```
As the system,
I want to ingest DA records nightly from NSW Planning Portal API + 15 council feeds (DA Leads, Council DA)
so that each Sunday digest contains the freshest available data (≤24 h old).

Acceptance Criteria:
  Given the nightly ingestion cron fires at 11 pm AEST Sunday–Saturday
  When the NSW Planning Portal Online DA Service API and configured council feed APIs are polled
  Then all newly lodged DAs for the configured LGAs are stored in Postgres within 60 minutes
  And each record includes: da_id, council, address, description, estimated_value, lodgement_date, applicant_name, portal_url, raw_scope_text
  And any API error triggers a Sentry alert and a retry within 15 minutes
  And ingestion count per LGA is logged to the observability table for drift detection

Priority: Must-have
Effort: L
```

##### Story CF-1.2 — Relevance scoring per user
```
As the relevance pipeline,
I want to score every new DA against each subscribed user's LGA bundle and roofing vocabulary
so that only the top 5–15 most relevant DAs appear in their digest.

Acceptance Criteria:
  Given new DA records are available after nightly ingestion
  When the Sunday digest job runs (trigger: Vercel Cron, Sunday 5:00 pm AEST)
  Then each DA is first filtered by the user's LGA bundle (rule pass — deterministic SQL)
  And each DA passing the rule filter is embedded (OpenAI text-embedding-3-small) and cosine-similarity ranked against the user's saved-query embedding stored in pgvector
  And the top-30 candidates are reranked by claude-haiku-4-5 with a one-line "why this matched" for each
  And the final list contains 5–15 DAs ranked by relevance score (0–10)
  And AI inference cost per user per weekly run is logged to ai_cost_log and must not exceed AUD 0.13 (weekly ceiling of AUD 0.50/month)
  And a Sentry alert fires if any user's weekly cost exceeds AUD 0.13

Priority: Must-have
Effort: XL
```

##### Story CF-1.3 — Sunday email digest delivery
```
As Estimator Eli,
I want to receive a mobile-optimised email digest at Sunday 6 pm AEST
so that I can scan my roofing leads before the week starts.

Acceptance Criteria:
  Given the relevance pipeline has produced a ranked list of 5–15 DAs for a subscribed user
  When Sunday 6:00 pm AEST arrives
  Then Resend sends a React Email template to the user's verified email address
  And the email contains a full-width stacked card for each DA with: address, LGA, estimated value (if available), scope summary (≤2 sentences), applicant name, "why this matched" one-liner, and a "View DA →" deep link to the council portal
  And the email renders correctly on iPhone 14 (iOS Mail) and Gmail Mobile (Android)
  And the email subject line is: "Your Sydney Roofing Digest — [N] leads this week"
  And if no DAs pass the relevance threshold (score < 4), the email is still sent with a "quiet week" message and the raw count of DAs checked
  And delivery succeeds within 5 minutes of the scheduled 6:00 pm trigger
  And a failed delivery triggers a Sentry alert and a retry within 30 minutes

Priority: Must-have
Effort: M
```

##### Story CF-1.4 — SMS top-3 digest delivery
```
As Estimator Eli,
I want to receive an SMS with the top 3 DA leads at Sunday 6 pm AEST
so that I can scan on my phone in the ute without opening email.

Acceptance Criteria:
  Given the email digest has been produced for a user with SMS enabled
  When Sunday 6:00 pm AEST arrives (same trigger as email)
  Then Twilio sends an SMS to the user's verified Australian mobile number (+61)
  And the SMS contains: 3 DA summaries each as "Address | Scope | AUD Value | Link" on a new line
  And each link is a shortened deep-link to the portal DA page (not PI-AU portal)
  And the SMS is ≤160×3 characters (concatenated, 3 parts max)
  And SMS delivery failure triggers a Sentry alert (non-blocking — email is the primary channel)

Priority: Must-have
Effort: S
```

##### Story CF-1.5 — One-tap click-through to source DA
```
As Estimator Eli,
I want to tap a link in the digest and land directly on the council DA portal page
so that I can view the attached architectural drawings and scope of works without navigating the portal.

Acceptance Criteria:
  Given Eli taps "View DA →" in the email digest or the SMS link
  When the link is opened on mobile browser
  Then the browser navigates directly to the council DA portal URL for that specific DA record
  And PI-AU does not re-host or cache any council documents (legal hygiene: public-data-only contract)
  And the link opens in the system browser (not a PI-AU in-app webview) so council portal SSO / cookies work
  And the link is a permanent direct URL (not a redirect through a PI-AU tracking endpoint) to preserve council portal compatibility

Priority: Must-have
Effort: S
```

##### Story CF-1.6 — Per-DA thumbs feedback
```
As Estimator Eli,
I want to give a thumbs-up or thumbs-down on each DA card in the digest
so that the system learns my preferences and improves next week's list.

Acceptance Criteria:
  Given Eli receives his Sunday email digest
  When he taps 👍 or 👎 on a DA card (single-tap, no modal, touch target ≥ 44×44 px)
  Then his feedback is recorded in Postgres as (user_id, da_id, feedback: up|down, created_at)
  And the digest email updates the card to show "Marked ✓" without a full page reload (inline POST via email action or portal link)
  And feedback data is available to the relevance pipeline for the following week's scoring
  And feedback is accessible from the PI-AU web portal for users who prefer desktop review

Priority: Must-have
Effort: M
```

##### Story CF-1.7 — Weekly precision recap stat
```
As Estimator Eli,
I want to see a "you captured N of M real re-roofs this month" stat at the top of my digest
so that I have proof the product is finding the right leads.

Acceptance Criteria:
  Given at least 4 weeks of digest history exist for a user
  When the Sunday digest is generated
  Then the email header includes: "Last 4 weeks: you saw [N] of [M] re-roof DAs in your area — [precision]% precision"
  And N is the count of user-thumbed-up DAs; M is the total relevant DAs in the user's LGAs per our internal labelled set (updated weekly by ops)
  And the stat is absent for users with < 4 weeks of history (replaced with onboarding tip)
  And the stat is rendered as the first block in the email, above the DA cards

Priority: Must-have
Effort: M
```

---

### Supporting Flow 1 (SF-1) — Self-Serve Signup with Card-on-File and LGA Scoping

##### Epic SF-1: Onboarding

##### Story SF-1.1 — Account creation
```
As a Sydney roofing owner-operator,
I want to create an account in under 60 seconds without a sales call
so that I can start my 14-day trial immediately.

Acceptance Criteria:
  Given I land on the PI-AU homepage
  When I click "Start free trial"
  Then I am presented with a form: email, password, mobile number (AU +61), and trade = "Roofing" (pre-selected, cannot be changed in V1)
  And on submit the account is created, a verification email is sent via Resend, and I am redirected to the LGA setup screen
  And total time from homepage to LGA setup screen (excluding email verification) is ≤ 60 seconds on a 4G mobile connection
  And auth is Lucia session with argon2id password hashing; email OTP is required before the first digest fires
  And no sales call, demo booking, or phone consultation is required

Priority: Must-have
Effort: M
```

##### Story SF-1.2 — LGA bundle selection
```
As Estimator Eli,
I want to select my service area from pre-built LGA bundles in two clicks
so that my digest covers the councils I actually work in.

Acceptance Criteria:
  Given I have completed account creation
  When I reach the LGA setup screen
  Then I am shown 4 pre-built bundles: "Western Sydney" (Penrith, Blacktown, Parramatta, Cumberland, The Hills), "Inner West & City" (Inner West, City of Sydney, Strathfield, Burwood), "Northern Sydney" (North Sydney, Willoughby, Hornsby, Lane Cove, Ku-ring-gai), "Southern Sydney" (Sutherland, St George, Georges River)
  And I can select 1 or more bundles (all 15 LGAs covered total across the 4 bundles)
  And my selection is saved as my default LGA filter for weekly digests
  And I can edit my LGA selection at any time from account settings
  And a "depot postcode radius" option is `[V2]`

Priority: Must-have
Effort: S
```

##### Story SF-1.3 — Stripe checkout and trial activation
```
As Estimator Eli,
I want to add my card and start a 14-day trial without being charged immediately
so that I can evaluate the digest before committing AUD 199/mo.

Acceptance Criteria:
  Given I have completed LGA setup
  When I am presented with the pricing screen
  Then I see: Solo — AUD 199/mo (1 seat, Sydney roofing); Team — AUD 499/mo (3 seats)
  And I click "Start 14-day trial" and enter card details via Stripe Checkout (Stripe AU, GST shown)
  And my card is saved but not charged until day 15
  And I receive a Resend confirmation email: "Trial started — your first digest arrives [next Sunday date]"
  And on day 12 I receive an automated reminder email: "Your trial ends in 2 days"
  And on day 15 the card is charged AUD 199 + GST if I have not cancelled
  And no free tier is offered; trial is the entry point

Priority: Must-have
Effort: M
```

##### Story SF-1.4 — Saved search seeding (pre-seeded roofing vocabulary)
```
As the system,
I want to pre-seed each new roofing account with a roofing-specific saved query embedding
so that the first digest is relevant without the user configuring anything.

Acceptance Criteria:
  Given a new account has completed LGA setup
  When the account is created
  Then a default saved query is attached: natural-language text = "re-roof, membrane replacement, Colorbond roof replacement, asbestos roof removal, roof tiling, metal deck roofing, guttering replacement"
  And the embedding of this query is computed (OpenAI text-embedding-3-small) and stored in pgvector at account creation time
  And users cannot edit the saved query in V1 (custom saved queries are `[V2]`)
  And the system confirms to the user: "Your first digest will arrive this Sunday at 6 pm — we're already scanning 15 Sydney LGAs for re-roof DAs."

Priority: Must-have
Effort: S
```

---

### Supporting Flow 2 (SF-2) — Per-DA Thumbs Feedback Improves Ranking

> Already covered in CF-1.6 (thumbs capture) and CF-1.7 (recap stat). The two
> additional stories below cover the feedback-loop integration into the ranking
> model, which is a distinct engineering concern.

##### Epic SF-2: Feedback Loop

##### Story SF-2.1 — Per-user feedback weight applied to ranking
```
As the relevance pipeline,
I want to incorporate each user's thumbs history into the DA ranking
so that the digest improves personalization after 4–6 weeks of use.

Acceptance Criteria:
  Given a user has ≥ 200 thumbs-labelled pairs (approx. week 4–6 of active use)
  When the Sunday scoring job runs for that user
  Then the LLM rerank prompt includes a summary of the user's top-5 thumbed-up DA descriptions as positive examples and top-5 thumbed-down descriptions as negative examples
  And the resulting ranking demonstrably shifts (A/B checked in eval harness) relative to the cold-start global model
  And users with < 200 pairs use the global roofing vocabulary model without personalisation
  And personalisation onset triggers a "Your digest is now personalised to your quoting style" in-email note

Priority: Must-have (personalisation onset is the retention driver at month 2–3)
Effort: L
```

##### Story SF-2.2 — Thumbs data accessible via web portal
```
As Estimator Eli,
I want to review and change my thumbs on any DA from the web portal
so that I can correct mistakes made in the Sunday-night rush.

Acceptance Criteria:
  Given I am logged into the PI-AU web portal
  When I navigate to "My Digests"
  Then I see a history of all digests, each showing the DA cards and my thumbs for that week
  And I can toggle a thumb from up to down (or vice versa) or remove it entirely
  And a changed thumb is written to Postgres within 2 seconds
  And the updated feedback is picked up by the next Sunday scoring run

Priority: Should-have
Effort: S
```

---

### Supporting Flow 3 (SF-3) — Billing and Account Settings

##### Epic SF-3: Billing, Subscription, and Account Management

##### Story SF-3.1 — View and cancel subscription
```
As Estimator Eli,
I want to cancel my subscription from the account settings page without calling anyone
so that I am not trapped in a Cordell-style renewal hostage situation.

Acceptance Criteria:
  Given I am logged into the PI-AU web portal
  When I navigate to "Account → Subscription"
  Then I see: current plan, next billing date, amount, and a "Cancel subscription" button
  And clicking "Cancel" shows a single-step confirmation with the final billing date
  And confirming cancellation updates Stripe (immediate cancellation of future charges)
  And I receive a Resend confirmation email: "Subscription cancelled — access continues until [date]"
  And my account retains read-only access to digest history until the period end
  And no retention flow, dark pattern, or phone call is required

Priority: Must-have
Effort: S
```

##### Story SF-3.2 — Update LGA bundle selection
```
As Estimator Eli,
I want to change my LGA bundles from account settings
so that I can adjust my service area if I win work in a new suburb.

Acceptance Criteria:
  Given I am logged into the PI-AU web portal
  When I navigate to "Account → My Area"
  Then I see the same LGA bundle picker from onboarding, with my current selection highlighted
  And I can add or remove bundles
  And saving the change updates my saved query scope in Postgres immediately
  And the change applies to the next Sunday digest (not retroactively to past digests)

Priority: Must-have
Effort: S
```

##### Story SF-3.3 — Upgrade from Solo to Team
```
As Gabby (Growth-Stage team),
I want to upgrade from Solo (1 seat) to Team (3 seats) from the billing page
so that my two estimators also receive the Sunday digest.

Acceptance Criteria:
  Given I am on the Solo plan (AUD 199/mo)
  When I navigate to "Account → Subscription → Upgrade"
  Then I see the Team plan (AUD 499/mo, 3 seats)
  And clicking "Upgrade" opens Stripe billing portal for plan change (prorated)
  And after upgrade I can invite 2 additional email addresses as seat holders
  And each seat holder receives their own Sunday digest with the same LGA bundle as the account owner
  And each seat holder can set their own thumbs preferences independently

Priority: Should-have
Effort: M
```

##### Story SF-3.4 — SMS opt-in / opt-out
```
As Estimator Eli,
I want to opt out of SMS if I prefer email-only
so that I am not bothered on Sunday night if I've already read the email.

Acceptance Criteria:
  Given I am logged into the PI-AU web portal
  When I navigate to "Account → Notifications"
  Then I see a toggle "Sunday SMS digest (top 3 leads)" defaulting to ON
  And toggling OFF disables Twilio SMS for the next and all subsequent digests immediately
  And I can re-enable at any time
  And SMS STOP reply also triggers opt-out (Twilio webhook → Postgres flag)

Priority: Must-have (SPAM Act 2003 compliance requires opt-out)
Effort: S
```

---

## 4. MVP Scope Definition

### V1 (MVP) — Must-have stories

The smallest product that validates the wedge hypothesis:
**Can we deliver a curated, 5–15-item Sunday-night digest of roofing DAs that
Estimator Eli finds more useful than Cordell's 47-item weekly email,
at AUD 199/mo, with self-serve signup in 60 seconds?**

| Story | Description | Flow |
|---|---|---|
| CF-1.1 | Nightly DA ingestion from 15 LGAs | Critical |
| CF-1.2 | AI relevance scoring (rule → embed → LLM rerank) | Critical |
| CF-1.3 | Sunday email digest delivery | Critical |
| CF-1.4 | SMS top-3 delivery | Critical |
| CF-1.5 | One-tap click-through to council DA | Critical |
| CF-1.6 | Per-DA thumbs feedback capture | Critical |
| CF-1.7 | Weekly precision recap stat (from week 4) | Critical |
| SF-1.1 | Account creation, email OTP | Supporting |
| SF-1.2 | LGA bundle selection | Supporting |
| SF-1.3 | Stripe checkout + 14-day trial | Supporting |
| SF-1.4 | Pre-seeded roofing saved query | Supporting |
| SF-2.1 | Per-user feedback weight applied to ranking | Supporting |
| SF-3.1 | View and cancel subscription (no dark pattern) | Supporting |
| SF-3.2 | Update LGA bundle | Supporting |
| SF-3.4 | SMS opt-in / opt-out (SPAM Act) | Supporting |

### V1.1 (should-have, weeks 6–10 post-launch)

| Story | Description |
|---|---|
| SF-2.2 | Thumbs history review and correction via web portal |
| SF-3.3 | Upgrade from Solo to Team |
| CF-1.7-enhanced | Per-user missed-DA count (ops labels all real re-roofs weekly) |

### V2 (roadmap — `[V2]` throughout this document)

Items tagged `[V2]` below are explicitly deferred. Count: **17 [V2] items**.

| # | `[V2]` Item | Rationale |
|---|---|---|
| 1 | `[V2]` Custom saved queries (user-editable natural-language filters) | Adds UX complexity; pre-seeded vocabulary is sufficient for V1 validation |
| 2 | `[V2]` Depot postcode radius filter | LGA bundles cover the use case; postcode radius is nice-to-have precision |
| 3 | `[V2]` HVAC vertical | Wedge #2 per market analysis; wedge #1 must be validated first |
| 4 | `[V2]` Civil-works subcontractor vertical | Wedge #3; same rationale |
| 5 | `[V2]` Melbourne / Brisbane expansion | Sydney-only V1; expansion gated on 100 Sydney paying customers |
| 6 | `[V2]` Multi-trade filter / cross-vertical digest | Contradicts Niche axis; ships when multiple verticals are live |
| 7 | `[V2]` Contact-data enrichment (architect/applicant phone numbers) | Cordell's moat; PI-AU is not competing on this in V1 |
| 8 | `[V2]` Head-contractor tender feed (EstimateOne-style) | EstimateOne's moat; out-of-wedge |
| 9 | `[V2]` API access for programmatic DA queries | Power-user feature; no V1 ICP needs it |
| 10 | `[V2]` Slack / webhook push alerts | Nice-to-have; Sunday digest cadence supersedes real-time alerts in V1 |
| 11 | `[V2]` Mobile native app (iOS / Android via Expo) | Mobile-first web is sufficient at preview tier; native is post-100-customers |
| 12 | `[V2]` Team-seat hierarchy / role-based permissions | V1 Team tier is a flat seat list; real RBAC is for multi-tenant V2 |
| 13 | `[V2]` AusTender + NSW eTendering government tender feed | DA-stage is the wedge; tender feed broadens to civil/HVAC verticals |
| 14 | `[V2]` Annual prepay billing option (2 months free) | Stripe annual plan; deferred until month-3 retention data exists |
| 15 | `[V2]` Per-user fine-tuned relevance model (beyond 200 thumbs weighting) | Full fine-tune is launch-tier AI work; thumbs weighting in CF-1.2 is the V1 proxy |
| 16 | `[V2]` "Quiet week" alternate content (e.g. roofing industry news) | Content strategy deferred; V1 digest is DA-only |
| 17 | `[V2]` Referral / affiliate programme | Growth lever; premature at preview scale |

### MVP "Done" Criteria

MVP is shippable when all of the following are true:

1. **Eval harness gate:** Relevance pipeline achieves precision ≥ 0.70 at recall ≥ 0.60 on the 500-pair labelled roofing set (promptfoo, `eval/`).
2. **End-to-end smoke test:** At least one real Sunday digest fires to a real email + SMS with ≥5 correctly classified re-roof DAs from the 15 configured LGAs.
3. **Signup-to-digest latency:** A new account created before Thursday 5 pm AEST receives the following Sunday's digest with no manual ops intervention.
4. **AI cost ceiling:** Weekly digest cost per active user is ≤ AUD 0.13 (verified on 10 simulated users before GA).
5. **Billing:** Stripe trial → charge flow tested with a real card; cancellation tested; GST line-item confirmed.
6. **Dogfood:** Founder can click through the Sunday digest in ≤5 minutes and find ≥1 DA they would quote. (`/dogfood` skill gate.)
7. **SPAM Act compliance:** SMS opt-out via STOP reply verified end-to-end.

---

## 5. Success Metrics (KPIs)

All metrics are measurable via PostHog (product events) + Postgres (business
events) + Stripe (revenue). No aspirational metrics.

| Metric | Baseline (pre-launch) | Target — Day 30 | Target — Day 90 | Measurement method |
|---|---|---|---|---|
| **Paying customers (Solo + Team)** | 0 | 10 | 30 | Stripe `active_subscriptions` |
| **Trial-to-paid conversion rate** | — | ≥ 20% | ≥ 25% | Stripe: trials created vs. converted at day-15 charge |
| **Digest open rate (email)** | — | ≥ 55% | ≥ 60% | Resend delivery events; benchmark: B2B segmented = 30–40%; digest targeting is higher |
| **SMS open rate (tap-through)** | — | ≥ 40% | ≥ 45% | Twilio delivery + click events on shortened DA links |
| **Per-DA thumb rate** | — | ≥ 50% of cards per digest | ≥ 65% | Postgres `da_feedback` rows ÷ digest cards sent |
| **Digest-to-portal click-through rate** | — | ≥ 30% of cards | ≥ 40% | PostHog event: `da_card_clicked` |
| **Relevance precision (global eval)** | Must hit before GA | ≥ 0.70 at recall ≥ 0.60 | ≥ 0.75 at recall ≥ 0.65 | promptfoo eval harness, `eval/`, weekly CI run |
| **AI cost per user per week** | — | ≤ AUD 0.13 | ≤ AUD 0.10 | `ai_cost_log` table, Sentry alert on ceiling breach |
| **30-day subscription retention** | — | ≥ 70% | ≥ 80% | Stripe: active at day-30 ÷ converted |
| **90-day subscription retention** | — | — | ≥ 65% | Stripe: active at day-90 ÷ converted at day-30 |
| **Signup-to-first-digest latency** | — | 100% of accounts receive first digest within 7 days of trial start | ≤ 3 days average | Postgres: `account.created_at` vs. first `digest.sent_at` |
| **NPS (end-of-trial survey, 1 question)** | — | ≥ 30 | ≥ 45 | Resend email at day 12 with single NPS question |
| **Monthly ARR** | AUD 0 | AUD 2,000 (10 × AUD 199) | AUD 7,500 (30 × AUD 250 blended) | Stripe MRR × 12 |
| **Churn rate (monthly)** | — | ≤ 10% | ≤ 7% | Stripe cancellations ÷ active subscriptions |

### Kill-switch thresholds (from wedge doc, reproduced for product tracking)

| Kill switch | Trigger | Action |
|---|---|---|
| 5.1 Demand kill | < 10 of first 50 outbound contacts agree to pay AUD 199/mo for trial within 8 weeks | Kill V1; re-examine wedge hypothesis |
| 5.2 Build kill | Precision < 0.60 at recall < 0.50 after 10 weeks of dev | Revert to manual-curation digest; re-evaluate AI in V1.5 |
| 5.3 Defensibility kill | Credible single-vertical clone ships before 100 paying customers | Pivot to civil-works vertical #2 |
| 5.4 Eval kill | Precision/recall cannot exceed Cordell keyword baseline by ≥ 3× after 4 weeks of iteration | Remove AI positioning; ship manual curation |

---

## 6. Assumptions & Risks

| # | Assumption | Risk if wrong | Validation method | Timeline |
|---|---|---|---|---|
| A1 | Sydney roofing owner-operators will pay AUD 199/mo for a curated weekly digest | If WTP is below AUD 99, unit economics break (AUD 0.50/user AI cost + infra + ops > 50% of revenue) | 10 hand-sold trials before any code spend; money-on-the-table validation | Pre-code, week 1–4 |
| A2 | DA-stage data from NSW Planning Portal + 15 council feeds is sufficient to cover ≥ 80% of re-roof projects a Sydney roofer would quote | If re-roofs are systematically exempt from DA lodgement, lead quality collapses | Manually review 50 recent council DA portal pages in the 4 bundles; count % that are genuine re-roof scope | Pre-code, week 1–2 |
| A3 | Precision ≥ 0.70 at recall ≥ 0.60 is achievable with text-embedding-3-small + claude-haiku-4-5 on roofing vocabulary | If roofing DAs are described too generically, embedding signal is too weak | Build 500-pair eval harness on real council DA descriptions before GA; check at week 4 of dev | Dev weeks 2–6 |
| A4 | Email + SMS is the right delivery channel (not a mobile app or dashboard) | If roofers do not open digests in email, the product is invisible | Track open rates from digest #1; if < 30% after 4 weeks, test push notification alternative | Post-launch, weeks 1–4 |
| A5 | Sunday 6 pm AEST is the right cadence; roofers quote on Sunday night / Monday morning | If quoting happens earlier in the week, the digest cadence misses the decision window | Survey 5 pilot users on quoting workflow before first digest | Pre-GA validation |
| A6 | Cordell's mid-rebrand (Cotality, Mar 2025) slows their product velocity for ≥ 12 months | If Cordell ships an SMB/AI vertical SKU within 6 months, the 10× window narrows | Monitor Cordell product announcements monthly | Ongoing |
| A7 | Public DA data (NSW Planning Portal API + council feeds) is legally safe and TOS-compliant for commercial product use | If data licensing terms prohibit commercial resale of DA data, the data layer must be rebuilt | Legal review of NSW Planning Portal API terms + DA Leads / Council DA API licence agreements before code | Pre-code, week 1 |

---

## 7. Open Questions

> **Count: 8 open questions requiring resolution before or during dev.**

1. **LGA coverage gap:** Does the NSW Planning Portal Online DA Service API v2 cover all 15 target LGAs, or are some councils DA Leads / Council DA API-only? Which 15 LGAs are confirmed with a live API key test?

2. **Re-roof DA exemption rate:** What proportion of actual re-roof works in NSW require a formal DA vs. a Complying Development Certificate (CDC)? CDCs may not appear in DA portals. Is the market analysis's assumption (DAs are the canonical re-roof signal) correct for residential strata specifically?

3. **Thumbs UI in email:** How does thumbs-up/down work in email clients that block JavaScript? Options: (a) two plain HTML links (`/feedback?id=X&v=1` and `/feedback?id=X&v=0`) that fire a server POST; (b) redirect to a portal page; (c) AMP for Email (Gmail-only). Which approach is correct given the mobile-first email constraint?

4. **Precision recap stat (CF-1.7) ops burden:** The "N of M real re-roofs" stat requires a weekly human-labelled ground-truth set for each user's LGAs. Who does this labelling, at what cost, and is it viable at 30+ users? Is a crowdsourced thumb-consensus a valid proxy until 100 users?

5. **AI cost ceiling at Team tier:** At 3 seats on the Team tier (AUD 499/mo), each seat runs its own scoring pipeline. That triples the AI cost per account. Does AUD 0.13/user/week × 3 seats = AUD 0.39/week still clear the AUD 0.50/month ceiling? (Yes — 0.39 × 4 = 1.56/month; the ceiling is per-user, not per-account. Confirm this interpretation with the tech-stack contract.)

6. **Stripe AU and GST:** Is the AUD 199/mo price inclusive or exclusive of GST? The wedge doc says "AUD 199/mo" but the tech-stack says "GST via Stripe AU." Must be resolved before checkout copy is written. Recommendation: AUD 199/mo + GST (i.e. AUD 218.90 total), clearly displayed at checkout.

7. **SMS character limit and DA summaries:** Can a useful DA summary ("12 Acacia Ave, Penrith | Existing dwelling re-roof, Colorbond | AUD 18k | link") fit within 160 characters per SMS part (3 parts max = 480 chars total for 3 DAs)? Needs a character-count test on real DA data before CF-1.4 is built.

8. **Eval harness labelling source:** The 500-pair labelled set (promptfoo, `eval/`) requires 500 (DA description, relevant: bool) pairs labelled by humans with Cohen's κ ≥ 0.6. Where do the 500 real DA descriptions come from before the ingestion pipeline is built? Options: (a) manual export from Penrith/Blacktown council DA portals; (b) purchase a DA Leads API sample; (c) NSW Planning Portal API key + 30-day sample pull. This must be resolved before week 2 of dev.

---

*End of specification.*

*Sources consulted for persona grounding:*
- *[Roofing Lead Generation 2025 — Glasshouse](https://www.glasshouse.biz/blog/roofing-lead-generation-2025)*
- *[B2B Customer Retention Statistics 2025 — SerpSculpt](https://serpsculpt.com/b2b-customer-retention-statistics/)*
- *[2025 SaaS Performance Metrics — Benchmarkit](https://www.benchmarkit.ai/2025benchmarks)*
- *[B2B SaaS Benchmarks 2026 — 42DM](https://42dm.net/b2b-saas-benchmarks-to-track/)*
- *[Deloitte / Autodesk State of Digital Adoption in Construction 2024](https://www.deloitte.com/content/dam/assets-zone1/au/en/docs/services/economics/state-digital-adoption-construction-industry-2024.pdf)*
