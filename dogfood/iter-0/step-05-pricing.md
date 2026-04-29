# Step 05 — Pricing / Plan Selection Step 4/4 (§7.5)

**Screenshot:** `step-05-pricing.png`
**Route:** `/plan`
**HTTP:** 200

## Score: 9/10

## Observations

- "Step 4 of 4" indicator visible.
- "Choose your plan" + "14-day free trial. Cancel anytime." subhead — matches design.
- Two plan cards — Solo (AUD 199/mo + GST, 1 seat · All 15 LGAs) and Team (AUD 499/mo + GST, 3 seats · All 15 LGAs) — matches §7.5 wireframe.
- Solo card pre-selected (radio checked) with amber border + amber-50 bg — matches "active: amber border".
- Trust microcopy: "Your card is not charged for 14 days. First digest arrives Sunday 6 pm AEST." — matches design copy verbatim.
- Pricing matches positioning + wedge contracts (Section 6 of 01c-wedge.md).
- Radio inputs are properly grouped (`role=radio`, `aria-checked`).

## Minor (-1)

- "Start 14-day trial" CTA is wired to the Stripe redirect; with `STRIPE_SECRET_KEY="stub"` the redirect would fail in dogfood — not exercised here. The pricing page itself renders correctly. (Out-of-scope for dogfood — third-party dependency.)
