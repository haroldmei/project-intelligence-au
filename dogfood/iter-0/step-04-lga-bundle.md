# Step 04 — LGA Bundle Selection Step 3/4 (§7.4)

**Screenshot:** `step-04-lga-bundle.png`
**Route:** `/onboarding/area`
**HTTP:** 200

## Score: 9/10

## Observations

- "Step 3 of 4" indicator visible.
- "Choose your service area" heading, "Pick the LGA bundles you work in. You can change this anytime." subtext — matches wireframe.
- Four LGA bundle cards rendered with name + member-LGA list:
  - Western Sydney — Penrith · Blacktown · Parramatta · Cumberland · The Hills
  - Inner West & City — Inner West · City of Sydney · Strathfield · Burwood
  - Northern Sydney — Hornsby · Ku-ring-gai · Ryde · Lane Cove · Willoughby
  - Southern Sydney — Sutherland Shire · St George · Hurstville · Rockdale
  
  All matches §7.4 wireframe.
- Selected card gets amber border + amber-50 bg + check icon — matches "Selected state: card has amber left border (3px) + amber-50 bg + check icon" exactly.
- "Continue" button correctly disabled until ≥1 selected (matches §7.4 "disabled until ≥1 selected").
- Tappable card targets are large (whole card row is the hit area, well above 44px).
- aria-pressed toggles correctly per accessibility tree.

## Minor (-1)

- The card click was wired as a plain `<button>` — the snapshot shows it as `[button] "..." [pressed]`. That's fine, but per spec the wireframe shows a checkbox `☐` glyph; the implementation uses a circle/check toggle. Equivalent UX, slight visual divergence.
