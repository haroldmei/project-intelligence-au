# Step 02 — Signup Step 1/4 (§7.2)

**Screenshot:** `step-02-signup-step1.png`
**Route:** `/signup`
**HTTP:** 200

## Score: 8/10

## Observations

- "Step 1 of 4" indicator visible (matches §7.2 "Step 1/4").
- "Start your 14-day trial" + "No sales call." — matches design copy.
- Email, Password (with show/hide eye toggle), Mobile (AU) with locked +61 prefix, Trade pre-selected to "Roofing" — all match wireframe.
- Touch targets: input height ~48px on mobile, full-width primary button — matches §5b "48px height mobile" and §5a "Full-width on mobile (`w-full`)".
- "I agree to the Terms and Privacy Policy" checkbox with proper label — matches §5b.
- "← Back" link to home and "Step 1 of 4" header — flow chrome present.
- "Already have an account? Log in →" — friendly secondary action.

## Issues (-2)

- **Phone validation is brittle.** The Mobile field rejected `412345678`, `412 345 678`, and `0412345678`. Only `+61412345678` was accepted. The placeholder shows `4XX XXX XXX` (suggesting plain digit entry), and the locked `+61` prefix implies the user supplies the trailing digits, but the validator wants the full E.164 `+61…` form including country code. That is an inconsistency between the visual prefix chip and the underlying schema. Friction-cost = several seconds; in 60-second-signup terms that is meaningful.
- Server-side error after submit is rendered as a terse "Validation failed." with no field-level highlighting; "Enter a valid AU mobile number." was only shown when Zod's per-field error fired (after entering `0412345678`). Inconsistent error pathing.
