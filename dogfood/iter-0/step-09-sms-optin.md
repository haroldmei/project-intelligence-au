# Step 09 — SMS Opt-in (§7.9)

**Screenshot:** `step-09-sms-toggle.png`
**Route:** `/account/sms`
**HTTP:** 200

## Score: 9/10

## Observations

- Heading "Notifications" with `← Account` back link.
- "Sunday SMS digest" label + "Top 3 leads via SMS at 6 pm AEST" sub-label — matches §7.9 wireframe copy.
- Switch element is `[switch] [checked]` with `aria-label="Toggle Sunday SMS digest"` — matches §10 a11y.
- Switch shows amber-on-active state (visible amber pill) — matches §7.9 "amber when on".
- Compliance copy: "Reply STOP to any SMS to opt out immediately." — matches design §7.9 verbatim.
- Bottom tab bar persists.

## Minor (-1)

- Wireframe shows the user's actual mobile number under the toggle ("(mobile: +61 4XX XXX XXX)") so the user can confirm they're sending to the right phone — implementation just shows generic text. Small but useful trust cue missing.
