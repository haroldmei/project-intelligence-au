# Step 10 — My Service Area (§7.10)

**Screenshot:** `step-10-my-area.png`
**Route:** `/account/area`
**HTTP:** 200

## Score: 9/10

## Observations

- Heading "My Service Area" with subhead "Your digest covers these LGA bundles:".
- Same 4 LGA bundles rendered as in onboarding step 3, with the user's prior selection (Western Sydney) showing the selected state (amber border + amber-50 bg + check) — matches §7.10 wireframe.
- "Changes apply from next Sunday's digest." copy present — matches design.
- "Save area" full-width amber primary CTA — matches §5a w-full mobile.
- LGA-card and onboarding card components share visual treatment — consistent.
- Bottom tab bar persists.

## Minor (-1)

- No visual feedback (toast?) on save — would need to actually click Save to verify, but per design §6 the spec calls for a `role="status"` toast "Area saved. Takes effect next Sunday." Couldn't confirm in dogfood.
