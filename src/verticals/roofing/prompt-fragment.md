## Relevance rubric (0–5)

| Score | Meaning | Examples |
|-------|---------|----------|
| **5** | Bull's-eye match. Re-roof / membrane / Colorbond / metal-deck replacement on an existing dwelling in a user's LGA, value within their wheelhouse. | "Existing dwelling — re-roof and re-clad with Colorbond, est. AUD 180k, Penrith" |
| **4** | Strong match. Roof-adjacent work on an existing structure (gutter replacement, asbestos roof removal, roof restoration, re-sheeting). | "Removal of asbestos cement roof tiles and replacement with Colorbond" |
| **3** | Possible match. Roofing mentioned but ambiguous scope (e.g. "alterations and additions including new roof"). Worth surfacing for human triage. | "Alterations and additions to existing dwelling including new roof over rear extension" |
| **2** | Weak match. Adjacent trade with roof component (solar PV install on existing roof, skylight install). Surface only if recall is more important than precision. | "Installation of 10kW solar PV system on existing dwelling" |
| **1** | Same trade vocabulary but wrong work type. Roofing on new-build (not in scope — that's the head contractor's tender). Roofing on commercial fitout (out of wheelhouse). | "New residential dwelling — slab, frame, and roof", "Commercial high-rise façade re-clad" |
| **0** | Filter mistake. The rule pass let this through but it has no roofing relevance at all. Wrong trade entirely (electrical, plumbing fixtures, signage). | "Internal fit-out — kitchen, bathroom, electrical only" |

## Hard constraints

1. **Vocabulary lock.** Treat "re-roof", "reroof", "re roof", "roof
   replacement", "re-sheet", "membrane upgrade", "Colorbond
   replacement", "metal deck replacement", "asbestos roof" as
   first-class evidence of a true match. Do NOT penalise for
   abbreviation or hyphenation variation.

2. **LGA scope.** A DA outside the user's nominated LGAs gets capped
   at score 1 even if otherwise perfect. The user explicitly chose
   their service area; surfacing out-of-area leads breaks trust.

3. **Trade scope.** A DA for a non-roofing trade (HVAC, plumbing,
   electrical, signage, fit-out, civil-works) gets score 0.
   Multi-trade DAs that include roofing get scored on the roofing
   portion only.

4. **Job size.** A DA for a trivial job (< AUD 50k, e.g. patch repair)
   gets capped at score 2. The wedge user quotes work in the AUD
   50k–500k band.

5. **Commercial high-rise.** Out of scope for residential strata +
   light commercial subbies. Cap at score 1.

6. **Personalisation.** If the input includes `thumbs_examples` (past
   user thumbs-up/down on similar DAs), use them to break ties. Never
   override the rubric — they shift confidence, not the score floor.
