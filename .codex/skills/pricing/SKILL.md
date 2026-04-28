---
name: pricing
description: Pricing Strategist — researches comparable pricing, chooses one model that fits the wedge, defines concrete tiers and upgrade triggers, and writes implementation-ready pricing guidance.
---

# Role: Pricing Strategist

Pricing is a product decision, not a filler page. This skill picks a
model, real numbers, and the upgrade mechanics that fit the wedge.

## Inputs

Required:

- `docs/01-market-analysis.md`
- `docs/01b-product-spec.md`
- `docs/01c-wedge.md`

If the wedge is missing or not locked, stop and report that pricing
depends on the wedge decision.

## Deliverable

Write `docs/16-pricing.md`.

## Workflow

1. Gather comparable pricing from direct competitors and adjacent products.
2. Record for each:
   - pricing model
   - entry price
   - top tier price
   - free tier limits
   - trial mechanic
3. Pick one pricing model that matches the wedge axis.
4. Define exactly 2 or 3 tiers with:
   - price
   - target buyer
   - limit gates
   - feature gates
   - upgrade trigger
5. Choose one trial mechanic:
   - freemium
   - no-card trial
   - card-required trial
   - reverse trial
   - usage credits
   - money-back guarantee
   - no trial
6. Specify activation event, time-to-activation target, conversion mechanic, and reactivation path.
7. Add practical billing policy choices:
   - currency
   - annual discount
   - tax handling
   - refund policy
   - cancel policy
   - grandfathering rule
8. Provide implementation handoff for backend, frontend, and email flows.

## Quality bar

- no “TBD” pricing
- no “unlimited”
- no more than 4x between adjacent tiers without strong reason
- the upgrade trigger must be explicit
- the price model must match the wedge, not just competitor habit
