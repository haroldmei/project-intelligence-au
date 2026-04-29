# Step 03 — OTP Verification Step 2/4 (§7.3)

**Screenshot:** `step-03-otp-verify.png`
**Route:** `/verify`
**HTTP:** 200

## Score: 7/10

## Observations

- "Step 2 of 4" indicator visible.
- Heading "Check your email" and body "We sent a 6-digit code to your email address." — matches design.
- Six separate input cells each with `aria-label="Digit N of 6"` (a11y compliant, §10 2.5.5).
- Visible cells are ~48px square — matches §5b OTPInput "6 × 48px cells".
- "Verify email" primary CTA is correctly disabled until 6 digits entered, and enables once filled.
- Resend code timer counts down ("Resend code (49s)") — matches design (60s cooldown).

## Issues (-3)

- **Auto-advance does not work via paste / programmatic fill.** Filling all 6 cells via per-cell input (`fill input[aria-label='Digit 1 of 6'] "1"` etc.) leaves `input[autocomplete=one-time-code]` unfound — there is no single `one-time-code` input wrapping the grid. Filling cell 1 with "123456" does NOT distribute across cells (each cell only takes 1 char). This is a UX regression vs. modern iOS auto-fill which delivers the whole code into the first cell. **Recommend** wrapping the grid with a hidden `<input autocomplete="one-time-code">` or implementing paste-distribute in the onChange handler.
- **Verify-email button click via accessibility tree fails** — the Playwright `click "button[type=submit]"` timed out because the button is `type="button"` (not `type="submit"`). Worked via JS click. The submit button should be `type="submit"` inside the form to support Enter-to-submit and screen-reader form semantics.
- The dev no-op email log writes only the recipient, not the OTP — this makes dogfooding the OTP flow impossible without DB write or `eli@example.com` shortcut. Consider logging the OTP code in DEV mode (gated behind NODE_ENV=development) so the test harness can complete the flow.
- Email body says "to your email address" rather than echoing the actual email like the wireframe shows ("eli@example.com"). Loses a trust cue.
