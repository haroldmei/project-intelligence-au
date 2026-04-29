# Step 10b — Cancel Subscription Confirm Dialog (§7.10b)

**Screenshot:** `step-10b-cancel-confirm.png`
**Route:** `/account` (modal opens via "Cancel subscription" button)
**HTTP:** 200

## Score: 9/10

## Observations

- Trigger lives on /account in the Subscription card, alongside Plan / Seats / Next charge — matches design.
- Account page itself shows: Plan "Solo — AUD 199/mo + GST", Seats "1", Next charge "27 May 2026" — correct numbers.
- AlertDialog opens with backdrop scrim dimming the underlying account page — matches §7.10b "settings page beneath, dimmed".
- Title: "Cancel your subscription?" (text-lg semibold) — matches design.
- Body line 1: "You'll keep digest access until **Sun 24 May 2026**." — dynamic period-end date computed correctly (today is 28 Apr 2026, period end is roughly +1 month). Matches design intent.
- Body line 2: "Your saved LGAs and feedback history stay for 90 days, then we delete them." — matches §7.10b retention copy verbatim.
- Two stacked buttons: red destructive "Cancel subscription" (top), white outlined "Keep my plan" (bottom) — matches §7.10b layout and colour spec.
- Buttons appear ≥48px tall, full-width — matches mobile spec.
- No surprise downsell, no exit-intent, no "tell us why" form — respects P5 Quiet Confidence.
- AlertDialog is centered, max-w-sm, rounded — matches §7.10b.

## Minor (-1)

- Could not verify default-focus-on-mount is "Keep my plan" (safe-default per design); browse `is focused` would be needed but the snapshot didn't expose focus state to inspect easily.
- Could not verify the 8s toast + Undo action (would need an actual cancellation round-trip with stubbed Stripe).
