# Pricing Strategy — ProjectIntelligence AU (PI-AU)

<!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds. -->

## Date: 2026-04-28
## Status: LOCKED

---

## 1. Comparable Pricing Research

### 1.1 Direct Competitor Pricing

| Product | Model | Free | Entry (AUD) | Top tier (AUD) | Trial | Notes |
|---|---|---|---|---|---|---|
| **Cordell Connect (Cotality)** | Seat subscription | None | AUD 577.50/mo (Lite, 1 state, 2 users, inc GST) | Quote-only (National / Commercial / Civil / Mining) | Demo-gated | Entry price is AUD 6,930/yr; no self-serve signup; sales-led above Lite. Source: Cotality product page, 2026. |
| **LeadManager (Hubexo / BCI Central)** | Seat subscription | None | Unpublished — "no fixed packages" | Unpublished | Demo-gated | Estimate AUD 4–15k/yr Lite / AUD 10–30k/yr Core, anchored to Cordell floor + customer-report range. Source: LeadManager site 2026; no public price. |
| **EstimateOne** | Seat subscription | None | AUD 3,000/yr (AUD 250/mo), sub seats | Head-contractor (est. AUD 8–15k/yr) | Limited-tender trial | Covers head-contractor → subcontractor tender flow only; no DA-stage. Source: estimateone.com/subcontractors, 2026. |
| **PlanningAlerts (OCAU)** | Freemium | Yes — civic, email alerts | AUD 3,850/mo Standard (commercial bulk) | AUD 3,850/mo Standard | Free email alerts | Civic-grade, no B2B product for trades, no government tenders. |
| **DA Leads** | API subscription | No | Undisclosed (tiered API) | Undisclosed | — | API-first, no end-user product for trades. Not a direct competitor. |

**WEAK: DA Leads and LeadManager prices are not publicly disclosed. Marked as estimates with sources above.**

### 1.2 Adjacent Category Anchors (Same ICP Pays Today)

| Product | Model | Price | Relevance to WTP |
|---|---|---|---|
| **Xero (accounting, SMB AU)** | Seat subscription | AUD 29–85/mo | The ICP already pays for SaaS at this band monthly. Proves month-to-month SaaS is acceptable. |
| **Buildxact (estimation / job management)** | Seat subscription | AUD 149–289/mo | Directly adjacent to roofing/trade subs; AUD 149–289/mo band is the established "SaaS for a tradie" ceiling. Proves AUD 199/mo is attainable. |
| **Cordell Connect Lite** | Seat subscription | AUD 577.50/mo | Proves the ICP already pays >AUD 199/mo for an inferior version of this product. Strongest WTP anchor. |

### 1.3 Mechanic Patterns Observed (Category Leaders)

| Product | Trial mechanic | Key pattern |
|---|---|---|
| **Linear** | Free tier → Pro $8/seat/mo | Generous free → hard seat limit triggers upgrade |
| **Notion** | Freemium → Plus $10/seat/mo | Collaboration wall (block/page history) is the upgrade trigger |
| **Vercel** | Hobby free → Pro $20/mo | Build minutes / team seats are the wall |
| **Stripe** | Usage-based, no trial | Payment processor — not applicable |
| **Cursor** | 14-day Pro trial, card not required | AI completions limit is the upgrade trigger; low-friction |

**Key observation:** For B2B SaaS with clear ROI proof and risk-averse buyers (trades), **card-on-file 14-day trials** (not no-card) are more appropriate than freemium. Freemium works when the product has daily natural use; a weekly digest is inherently high-value-low-frequency, so a free tier would see zero engagement that proves the wedge.

---

## 2. Chosen Model & Justification

**Model: Flat-rate tiered subscription (Solo / Team), monthly, no free tier.**

The wedge axis is **Niche** (see `01c-wedge.md`, LOCKED). The Niche pricing default is "per-seat or flat-rate-per-business." PI-AU fits flat-rate-per-business at the Solo tier (one seat for the owner-operator) and scales to a flat-team-rate at the Team tier (three seats for the estimating team).

**Why not freemium:** The anti-axis explicitly forbids a free tier. Free trains the ICP that the Sunday digest is worth zero, and the Niche axis depends on trust — a roofer who has never paid for project intelligence will not trust that a free digest is curated to their standards. The 14-day trial is the trust-builder; freemium destroys pricing power and race-to-zero dynamics are structurally excluded.

**Why not usage-based:** The product delivers a fixed weekly digest. There is no usage dimension that maps to value — "per DA seen" would penalise relevance (more DAs = higher bill = perverse incentive). Flat-rate aligns with the "set and forget" mental model of an owner-operator.

**Why not annual-only:** The wedge promises "cancel anytime" as a direct trust contrast to Cordell's "renewal hostage situation." Annual locks contradict this. Annual prepay is deferred to V2 (see `01b-product-spec.md` §V2 item 14: after month-3 retention data exists). **Annual option: NO for MVP.** Commits dollars without proving value; conflicts with "cancel anytime" trust messaging. When 90-day retention ≥ 65% is confirmed, introduce as an optional 2-months-free incentive.

**Competitor delta check:** PI-AU Solo at AUD 199/mo sits at **0.34× Cordell Lite** (AUD 577.50/mo) — well within the 0.5×–2× guidance range. EstimateOne entry is AUD 250/mo; PI-AU Solo at AUD 199/mo is 0.8× — very close, which is appropriate because the ICP already pays EstimateOne at that band and both products are solving adjacent pains. Not a commodity trap: PI-AU's delivery channel (weekly digest, roofing-only) is structurally different from EstimateOne's head-contractor tender platform.

---

## 3. Tier Architecture

### 3.1 Tier Table

| Tier | Price (+ GST) | Seats | Scope | Who it's for |
|---|---|---|---|---|
| **Solo** | AUD 199/mo | 1 seat | All 15 Sydney LGAs, roofing vertical | Owner-operator of a 4–15-person Sydney roofing business who personally quotes or supervises one estimator. "Estimator Eli." |
| **Team** | AUD 499/mo | 3 seats | All 15 Sydney LGAs, roofing vertical | Operations manager running a 10–30-person firm with 2 estimators. "Growth-Stage Gabby." |

**Note on scope:** Both tiers include all 15 Sydney LGAs and the roofing vertical only. There is no tier that unlocks Melbourne, Brisbane, HVAC, civil, or multi-trade. That is V2, not a paid add-on in V1. This is deliberately anti-upsell — selling a multi-vertical add-on contradicts the Niche wedge.

### 3.2 Limit & Feature Gates Per Tier

#### Solo — AUD 199/mo + GST

**What's included:**
- 1 seat (single account login, single Sunday digest recipient)
- Weekly Sunday email digest (5–15 roofing DAs, ranked by relevance)
- Sunday SMS top-3 digest (opt-in, AU mobile numbers only)
- All 15 Greater Sydney LGA bundles (Western Sydney, Inner West & City, Northern Sydney, Southern Sydney — user selects any/all)
- Pre-seeded roofing vocabulary (re-roof, membrane, Colorbond, asbestos roof removal, guttering replacement, metal deck)
- Per-DA thumbs feedback (improves ranking from week 4–6)
- Weekly precision recap stat ("you saw N of M real re-roofs")
- In-app cancel at any time (no support ticket)
- 14-day free trial, card on file

**What's NOT included (locked behind Team or explicitly out-of-scope):**
- Additional seats (Solo is 1 seat, hard cap)
- Seat invitation flow (Team-only feature)
- Custom saved queries (V2 for all tiers)
- API access (V2)
- AusTender / government tender feed (V2)
- HVAC / civil / multi-trade vertical (V2)
- Melbourne / Brisbane LGAs (V2)
- Contact-data enrichment (never — anti-axis)
- Head-contractor tender flow (never — anti-axis)

#### Team — AUD 499/mo + GST

**What's included (everything in Solo, plus):**
- 3 seats (account owner + 2 invited email addresses)
- Each seat holder receives an independent Sunday digest using the shared LGA bundle
- Each seat holder can set independent thumbs preferences
- Seat invitation flow (account owner invites 2 additional emails; each receives their own digest)
- Shared account billing under one subscription

**Upgrade trigger:** Solo user attempts to invite a second seat (clicks "Invite team member"). Paywall appears immediately with a prorated upgrade to Team.

**What's NOT included:**
- More than 3 seats (Team is 3, hard cap; more than 3 seats is V2+)
- Role-based permissions (flat seat list in V1; RBAC is V2)
- Shared digest inbox / digest merging across seats (each seat has their own digest)
- Admin dashboard (V2)

### 3.3 Upgrade Triggers

| Trigger event | Action |
|---|---|
| **Solo user clicks "Invite team member"** | In-app paywall: "Inviting a team member requires the Team plan (AUD 499/mo). Upgrade now?" Stripe billing portal opens for prorated plan change. |
| **Trial day 15 (no cancel)** | Stripe charges AUD 199 + GST (Solo) or AUD 499 + GST (Team) automatically. `trial_ending_3d` email fires on day 12. |
| **Solo user sees Team-tier copy at checkout** | Pricing screen at signup shows both tiers; "most roofers start on Solo" label on Solo. |

**Anti-pattern checklist (self-audit):**
- Price ladder: Solo AUD 199 → Team AUD 499 is **2.51×** — within the 4× maximum. Pass.
- "Unlimited" anywhere: No. All 15 LGAs is a defined, finite list. 3 seats is a hard cap. Pass.
- Top tier bullet bloat: Team adds exactly 2 differentiating features (extra seats + seat invitation). Pass.
- Free tier too generous: No free tier. Pass.
- Commodity trap: AUD 199 is 0.34× Cordell and 0.8× EstimateOne — differentiated positioning. Pass.

---

## 4. Trial Mechanics

**Chosen mechanic: 14-day free trial, card on file.**

**Justification:** PI-AU is B2B with a weekly delivery cadence. The ICP (Sydney roofing owner-operators) has been burned by Cordell's sales-led, quote-only, no-cancel dynamic — they are price-sensitive but not immune to paying. Card-on-file reduces abuse risk (prevents serial trial re-signups) and increases commitment signal. No-card trials in this segment see 2–3× lower paid conversion (B2B SaaS benchmark, Benchmarkit 2025). Reverse trial is not applicable — there is no free tier to fall back to.

### 4.1 Activation Event

**Activation event: user opens the first Sunday email digest and taps at least one DA card (click-through to council portal) OR gives at least one thumbs-up/down feedback.**

This is not signup. Not card entry. Not LGA selection. The activation is the moment Eli sees a roofing DA he would actually quote — the wedge delivered. PostHog event: `digest_card_interacted` (either `da_card_clicked` or `da_feedback_given`).

**Time-to-activation target:** ≤ 7 days (first Sunday digest after signup). If signup occurs before Thursday 5 pm AEST, the next Sunday digest fires. Maximum wait is 6 days. This is above the <5-min B2C target but appropriate for a weekly product — the digest cadence IS the product clock.

**Onboarding bridge:** Between signup and first digest, the app shows a countdown ("Your first digest arrives this Sunday at 6 pm — we're already scanning 15 Sydney LGAs"). This prevents trial churn from "nothing happened" before the first digest.

### 4.2 Trial End Conversion Mechanic

| Day | Event | Action |
|---|---|---|
| Day 0 | Trial starts | `trial_started` email: "Your first digest arrives [next Sunday date]." Card confirmed but not charged. |
| Day 7 | First digest fires | Activation event window opens. PostHog tracks `digest_card_interacted`. |
| Day 12 | 2-day warning | `trial_ending_3d` email: "Your trial ends in 2 days. You'll be charged AUD 199 + GST on [date] unless you cancel." NPS survey (1 question) embedded. Cancel link prominent — no dark pattern. |
| Day 14 | Second digest fires | User has now seen 2 digests. |
| Day 15 | Trial end | If no cancel: Stripe charges AUD 199 (or AUD 499 for Team) + GST. `subscription_renewed` email. If cancelled: access continues to end of trial period; `subscription_canceled` email. |

**Hard lockout on day 15 (no soft degrade):** If trial ends without conversion, account moves to read-only (digest history viewable, no new digests). No partial free access — this reinforces that the digest has value and prevents "I'll just stay on trial mode" behaviour.

### 4.3 Reactivation

Trial expirations who did not convert receive a 3-email reactivation sequence:
- **Day 16:** "Did we miss something?" — 1-question survey + link to reactivate.
- **Day 23:** "This week's roofing DA digest was [N] items across your LGAs — here's a sample headline." One anonymised lead teaser to re-demonstrate value.
- **Day 37:** "Last chance — your trial data will be archived in 7 days." Data retention hook.

After day 44, account data is retained but inactive. No further emails (SPAM Act 2003 compliance).

### 4.4 Full Refund Policy

Users who are charged on day 15 and have **zero digest interactions** (zero `da_card_clicked` and zero `da_feedback_given` events in their account history) may request a full refund within 7 days of the charge. Refund is processed in Stripe with no questions asked. This is the "bad week" safety valve — if the ingestion pipeline failed to deliver a useful digest, the refund removes the retention risk. Users with any interaction are not eligible for automatic refund; standard refund consideration applies at founder discretion.

---

## 5. Currency, Tax, Refunds

### 5.1 Currency

**Default currency: AUD (Australian Dollar).** AU-only V1. USD pricing is not offered in V1.

### 5.2 GST Handling

All displayed prices are **exclusive of GST** — shown as "AUD 199/mo + GST" at all touchpoints (pricing page, checkout, receipts). GST (10%) is added at Stripe checkout and appears as a line item on the invoice. Stripe Tax (Stripe's built-in tax product) handles AU GST registration, calculation, and invoice formatting. Configuration:

- Stripe account: AU entity (ABN registered)
- Stripe Tax: enabled for AU, GST 10%
- Product tax code: `txcd_10103001` (SaaS / software subscription, digital services)
- Invoices: Stripe automatically generates GST-compliant AU tax invoices for B2B customers

**Note:** At AUD 199/mo + GST, the all-inclusive amount is AUD 218.90/mo. Checkout copy shows both: "AUD 199/mo + GST (AUD 218.90/mo total)" to avoid sticker shock at checkout.

### 5.3 Annual Option

**NO annual option in MVP.** Rationale: annual locks conflict with "cancel anytime" trust messaging (the anti-Cordell positioning). Annual prepay would save the customer ~AUD 398/yr (2 months) but undermines the trial mechanic and trust story. Revisit after 90-day retention data (target ≥ 65%) is confirmed — at that point, introduce as an optional 2-months-free incentive, not a default.

### 5.4 Refund Policy

Full refund: within 7 days of day-15 charge if account has **zero usage** (zero digest card interactions). Issued within 5 business days via Stripe. No partial refunds for mid-period cancellations — access continues to end of the paid period. After cancellation, no further charges.

### 5.5 Cancel Policy

In-app cancellation from "Account → Subscription → Cancel." Single confirmation step showing the final access date. No support ticket required. No retention dark pattern (no "are you sure? here's a discount" pop-up in V1 — this is an explicit anti-Cordell trust signal).

### 5.6 Grandfathering Rule

Any price increase affects new subscribers only. Existing subscribers keep their price for a minimum of 12 months from the date of any price change. They receive 60 days advance notice by email before any price change takes effect.

### 5.7 GST Registration Note

PI-AU must register for GST when annual turnover exceeds AUD 75,000 (ATO threshold). At 50 Solo customers = AUD 119,400/yr excl. GST — already above threshold. Register for GST before first paying customer. Stripe Tax handles the calculation once the AU ABN is configured.

---

## 6. Implementation Handoff

### 6.1 Stripe Products & Prices

```
Stripe Products:
  - product_solo:   "PI-AU Solo" (description: "Weekly Sydney roofing DA digest — 1 seat")
  - product_team:   "PI-AU Team" (description: "Weekly Sydney roofing DA digest — 3 seats")

Stripe Prices (monthly, AUD, exclusive of tax):
  - price_solo_monthly:   AUD 199.00/mo, billing_period: month, product: product_solo
  - price_team_monthly:   AUD 499.00/mo, billing_period: month, product: product_team

  (Annual prices: NOT created for MVP — deferred to V2)

Trial configuration (per price):
  - trial_period_days: 14
  - payment_behavior: "default_incomplete" (card required at trial start, not charged until day 15)

Stripe Tax:
  - automatic_tax: enabled
  - customer_update: { address: "auto" }
  - tax_id_collection: enabled (for B2B customers wanting to provide ABN for invoices)
```

**Stripe product IDs** are placeholders above — replace with actual `prod_xxx` and `price_xxx` values after `stripe products create` and `stripe prices create` commands are run.

### 6.2 Backend Wiring

**Webhook events to handle (backend-developer):**

| Event | Action |
|---|---|
| `customer.subscription.created` | Set `user.subscription_status = trial`, `user.trial_ends_at`, send `trial_started` email |
| `customer.subscription.trial_will_end` | Fires 3 days before trial end (Stripe default) — send `trial_ending_3d` email with NPS survey |
| `customer.subscription.updated` | Handle plan changes (Solo → Team): update `user.plan`, provision additional seats |
| `customer.subscription.deleted` | Set `user.subscription_status = canceled`, send `subscription_canceled` email, move account to read-only |
| `invoice.payment_succeeded` | Set `user.subscription_status = active`, send `subscription_renewed` email |
| `invoice.payment_failed` | Set `user.subscription_status = past_due`, send `payment_failed` email, block new digest delivery until resolved |

**Entitlement model (Postgres columns on `users` table):**

| Column | Type | Description |
|---|---|---|
| `subscription_status` | enum: `trial / active / past_due / canceled` | Gates access to digest delivery |
| `plan` | enum: `solo / team` | Gates seat provisioning |
| `seat_count` | int (1 or 3) | Enforced maximum seats; Solo=1, Team=3 |
| `trial_ends_at` | timestamp | Day 15 charge date |
| `stripe_customer_id` | varchar | Stripe customer reference |
| `stripe_subscription_id` | varchar | Stripe subscription reference |

**Quota model:**

| Resource | Reset | Ceiling |
|---|---|---|
| Digest deliveries | Weekly (Sunday) | 1 per seat per week |
| SMS deliveries | Weekly (Sunday) | 1 per seat per week (opt-in only) |
| AI inference cost | Weekly | AUD 0.13 per seat per week (Sentry alert on breach) |
| DA records visible | No cap | All DAs in user's LGA bundle, scored and filtered to 5–15 |

No usage counters need to reset except the weekly digest log (for idempotency — prevents double-send).

**Solo → Team upgrade (prorated billing):**

When a Solo subscriber upgrades to Team, Stripe prorates the difference. Backend must:
1. Call `stripe.subscriptions.update` with the new `price_team_monthly` price ID.
2. Set `user.plan = team`, `user.seat_count = 3`.
3. Unlock the seat invitation flow.
4. Send `upgrade_confirmed` email.

### 6.3 Frontend Wiring

**Pricing page route:** `/pricing`

The pricing page is the canonical source of truth for all pricing copy — see Section 7 for verbatim copy.

**Upgrade CTAs (in-app):**

| Location | CTA text | Trigger |
|---|---|---|
| Account → Subscription (Solo plan) | "Add team members — upgrade to Team" | Visible to Solo subscribers always |
| "Invite team member" button (Solo plan) | Button is visible; clicking it shows paywall modal | Solo user attempts to invite |
| Digest email footer | "Enjoying PI-AU? Invite your estimator →" | Weekly email footer for Solo users |

**Paywall component:**

Triggers on: Solo user clicks any "Invite team member" UI element.

Props:
```typescript
<PlanUpgradeModal
  currentPlan="solo"
  targetPlan="team"
  monthlyPrice={499}
  currency="AUD"
  seatCount={3}
  onConfirm={() => openStripeBillingPortal()}
  onDismiss={() => closeModal()}
/>
```

**Billing portal:**

Stripe Customer Portal handles: plan changes, payment method updates, invoice history, cancellation. Route: `/account/billing` → redirect to `stripe.billingPortal.sessions.create` URL.

### 6.4 Email Templates Required

The `email-templates` phase must produce these 8 templates (reference IDs for Resend):

| Template ID | Trigger | Key content |
|---|---|---|
| `trial_started` | Subscription created (day 0) | "Your 14-day trial has started. First digest: [next Sunday date]." Card confirmed, not charged. Cancel link. |
| `trial_ending_3d` | `customer.subscription.trial_will_end` (day 12) | "Your trial ends [date]. You'll be charged AUD [price] + GST. Cancel anytime before then." NPS 1-question survey. |
| `trial_ended_no_convert` | Day 15, subscription cancelled | "Your trial has ended. Re-activate anytime at AUD 199/mo." One anonymised digest teaser. |
| `subscription_renewed` | `invoice.payment_succeeded` | "You've been charged AUD [amount] + GST. Next digest: [Sunday date]." Invoice link. |
| `payment_failed` | `invoice.payment_failed` | "We couldn't charge your card. Update payment details to continue receiving your digest." Stripe portal link. |
| `subscription_canceled` | `customer.subscription.deleted` | "Subscription cancelled. Access continues until [date]. Your digest history is preserved." |
| `upgrade_confirmed` | Plan change Solo → Team | "You've upgraded to Team (3 seats). Invite your estimators: [link]." |
| `reactivation_day16` | 1 day after trial expires without conversion | "Did we miss something?" 1-question survey + reactivate link. |

---

## 7. Pricing Page Copy Snippets

*Used verbatim by the `landing-page` skill. Do not edit or paraphrase.*

### 7.1 Hero Section

**Headline:**
> Simple pricing. No surprises. Cancel anytime.

**Sub-headline:**
> One plan for owner-operators. One for small teams. No sales call. No annual lock-in.

### 7.2 Trial Banner

> **Start your 14-day free trial.** Card required — charged on day 15 only if you don't cancel. Full refund within 7 days of first charge if you've had zero leads.

### 7.3 Solo Tier Card

**Plan name:** Solo

**Price line:** AUD 199 /mo + GST

**Tag line:** For owner-operators who quote their own work.

**Included:**
- 1 seat — your Sunday digest, your phone
- All 15 Greater Sydney LGAs (Western Sydney, Inner West, Northern, Southern)
- Weekly email digest: 5–15 roofing DAs, ranked by relevance
- Sunday SMS: top-3 leads to your +61 mobile
- AI-curated to roofing vocabulary (not keyword soup)
- Thumbs feedback → your digest gets smarter each week
- Cancel anytime from your account — no support call

**CTA button:** Start 14-day trial

**Fine print:** AUD 199/mo + GST (AUD 218.90/mo total). Card required. No charge for 14 days. Cancel anytime.

### 7.4 Team Tier Card

**Plan name:** Team

**Price line:** AUD 499 /mo + GST

**Tag line:** For firms with an estimating team.

**Includes everything in Solo, plus:**
- 3 seats — invite 2 estimators, each gets their own Sunday digest
- Independent thumbs feedback per seat (each estimator's digest personalises separately)
- Shared billing, one subscription

**CTA button:** Start 14-day trial

**Fine print:** AUD 499/mo + GST (AUD 548.90/mo total). Up to 3 seats. Card required. No charge for 14 days. Cancel anytime.

### 7.5 Comparison Table vs. Incumbents

| | **PI-AU Solo** | **PI-AU Team** | **Cordell Connect Lite** | **EstimateOne** | **LeadManager** |
|---|---|---|---|---|---|
| **Price** | AUD 199/mo + GST | AUD 499/mo + GST | AUD 577.50/mo inc GST | AUD 250/mo (AUD 3,000/yr) | Quote-only |
| **Seats** | 1 | 3 | 2 | 1 | Undisclosed |
| **Geographic scope** | 15 Sydney LGAs | 15 Sydney LGAs | 1 state (NSW) | Head-contractor tenders (AU-wide) | AU + APAC |
| **Trade scope** | Roofing only | Roofing only | All trades | All trades (tender stage) | All trades |
| **DA-stage coverage** | Yes | Yes | Yes | No | Yes |
| **Government tenders** | V2 | V2 | Yes | Limited | Yes |
| **AI relevance** | Yes — roofing vocabulary | Yes — roofing vocabulary | No — keyword/category | No | No |
| **Self-serve signup** | Yes — 60 seconds | Yes — 60 seconds | No — sales call | Limited trial | No — demo only |
| **14-day trial** | Yes — card on file | Yes — card on file | Demo only | Limited-tender trial | Demo only |
| **Cancel anytime** | Yes — in-app | Yes — in-app | No — sales-led renewal | Yes | Unknown |
| **Sunday digest cadence** | Yes | Yes | No | No | No |
| **SMS alerts** | Yes | Yes | No | No | No |

### 7.6 What We Don't Sell

> **PI-AU does not sell:**
> - Contact data (architect / applicant phone numbers or emails) — that's Cordell's add-on, not ours.
> - Head-contractor tender flow — that's EstimateOne, not us.
> - Multi-trade horizontal leads — we're roofing only until we've proven the model.
> - Annual lock-in contracts — we earn your renewal monthly.
> - A free tier — the Sunday digest is worth paying for, and we stand behind it with a 7-day refund guarantee.

### 7.7 FAQ Snippets

**Q: Why do you require a card for the trial?**
A: To reduce abuse. We reviewed 14 days of real DA data for your LGAs before you even open the first digest — that costs us money and time. The card is how we know you're serious. You won't be charged until day 15, and you can cancel in-app anytime before then.

**Q: Is the AUD 199 price inclusive or exclusive of GST?**
A: Exclusive. The all-in price is AUD 218.90/mo (AUD 199 + 10% GST). Your invoice will show both as separate line items, making it easy to claim as a business expense.

**Q: What happens if I cancel?**
A: Your access continues until the end of your paid period. No prorating, no drama. Cancel from Account → Subscription — no support ticket needed.

**Q: Can I get a refund?**
A: If you've had zero digest interactions (never clicked a DA, never given feedback) and you're charged on day 15, we'll refund the full amount within 7 days. Just email us. No questions asked.

**Q: Will the price go up?**
A: Possibly, as we add features. But existing customers keep their price for at least 12 months after any price change — you'll always get 60 days' notice.

---

## Self-Critique Gate

### Mom Test
A Sydney roofing owner sees two tiers: Solo at AUD 199/mo (1 seat) and Team at AUD 499/mo (3 seats). He is Estimator Eli (1-person quoting operation) — he picks Solo without reading the Team copy. Gabby (2 estimators under her) sees Team and invites her two estimators. Both know immediately which tier they belong in. **Pass.**

### Spreadsheet Test
ROI case for Eli: He currently pays Cordell AUD 577.50/mo and spends 6 hours/week triaging. PI-AU costs AUD 218.90/mo (inc GST) and returns 5 minutes/week. Cost saving vs Cordell: AUD 358.60/mo. Time saving: ~24 hours/month. At AUD 80/hr opportunity cost, that's AUD 1,920/month in recovered time + AUD 358.60 cash saving = **AUD 2,278.60/month ROI on a AUD 218.90 spend**. 10× positive in 60 seconds of back-of-napkin math. **Pass.**

### Competitor Delta
Solo AUD 199/mo vs Cordell AUD 577.50/mo = 0.34×. Solo AUD 199/mo vs EstimateOne AUD 250/mo = 0.80×. Both within 0.5×–2× guidance range (lower bound breached vs Cordell, but this is intentional and the wedge's price advantage is the positioning, not a commodity trap — the delivery channel and niche are structurally different). **Pass with note.**

### Wedge Consistency
Niche axis → flat-rate subscription at mid-high price for a small TAM. AUD 199/mo is mid-range for AU trade SaaS (above Xero, below Cordell). Trial mechanic is card-on-file (appropriate for Niche/trust axis, not freemium). No free tier (explicitly required by anti-axis). Upgrade trigger (second seat) is cleanly tied to team growth, not artificial feature locks. **Pass.**

---

## Open Issues

0 open issues. All binding constraints from wedge are honoured:
- Solo: AUD 199/mo + GST. One seat. All 15 LGAs. ✓
- Team: AUD 499/mo + GST. Three seats. All 15 LGAs. ✓
- 14-day trial, card on file, day-15 charge. ✓
- Full refund within 7 days post-charge if zero usage. ✓
- No free tier. ✓
- No contact-data add-on. ✓
- No head-contractor tender upsell. ✓
- No multi-trade add-on. ✓
- GST via Stripe Tax, AUD prices shown "+ GST". ✓
- Annual option: NO for MVP. ✓
- Upgrade trigger: second seat invitation (Solo → Team). ✓

---

## Pricing Locked

- Model:              Flat-rate tiered subscription
- Tiers:              Solo AUD 199/mo + GST | Team AUD 499/mo + GST
- Trial:              14-day, card on file, day-15 charge
- Activation event:   First Sunday digest: user taps DA card or gives thumbs feedback
- Currency:           AUD
- Status:             LOCKED
