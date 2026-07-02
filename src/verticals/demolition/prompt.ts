// Demolition rerank rubric fragment — spliced into the system prompt by
// composeRerankSystemPrompt(). Written in the same voice and shape as the
// roofing rubric in src/prompts/rerank.system.md (0–5 table + hard constraints).
//
// Grading intent for the demolition subbie ICP (residential + light-commercial
// sites, jobs in the ~AUD 30k–500k band):
//   5  standalone demolition of a dwelling/structure — the whole job IS demolition
//   4  demolition as the lead/enabling scope (knock-down rebuild, asbestos/hazmat
//      strip, fire-damage make-safe) even when a rebuild follows
//   3  partial/selective demolition inside an alterations & additions DA
//   2  minor demolition component within a larger non-demolition job
//   1  same vocabulary, wrong work: demolition already done under separate
//      consent, out-of-area, or out-of-wheelhouse commercial high-rise
//   0  no demolition at all — pure re-roof, or an internal fit-out soft strip-out

export const DEMOLITION_RERANK_FRAGMENT = `## Relevance rubric (0–5) — demolition

| Score | Meaning | Examples |
|-------|---------|----------|
| **5** | Bull's-eye. Standalone demolition of a dwelling/structure in a user's LGA — the whole scope is demolition, site left clear/made safe. | "Demolition only — removal of existing dwelling and outbuildings, site to be left clear" |
| **4** | Strong. Demolition is the lead / enabling scope: knock-down rebuild, licensed asbestos or hazmat removal, fire-damage make-safe — even where a rebuild follows. | "Full demolition of existing dwelling to enable knock-down rebuild; vacant possession" |
| **3** | Possible. Partial / selective demolition within an alterations & additions DA (demolition of rear/portion to enable an extension). Worth surfacing for triage. | "Alterations and additions including partial demolition of rear wall and roof for new extension" |
| **2** | Weak. Minor demolition component inside a larger non-demolition job (removal of an existing carport, shed, pool, or non-structural partitions). | "Reconfiguration of dwelling including removal of existing internal partitions and a garden shed" |
| **1** | Same vocabulary, wrong work. Demolition already completed under a separate consent; out-of-area; or out-of-wheelhouse commercial/high-rise demolition. | "Construction of new dwelling on vacant lot following prior demolition (separate consent)" |
| **0** | Filter mistake. No demolition at all — pure re-roof, or an internal fit-out "soft strip-out" of non-structural shopfittings/partitions. | "Internal office fit-out — soft strip-out of partitions, new ceiling tiles; no structural demolition" |

## Hard constraints

1. **Vocabulary lock.** Treat "demolition", "demolish", "knock-down rebuild",
   "KDR", "asbestos removal", "hazmat", "site clearance", "vacant possession",
   "make-safe" and "site to be left clear" as first-class evidence of a true
   match. Do NOT penalise for abbreviation or hyphenation variation.

2. **Strip-out is not demolition.** An internal "strip-out" / "soft strip" of
   non-structural partitions or shopfittings in a fit-out DA is NOT demolition
   — score it 0 unless the DA also proposes structural demolition or removal of
   the building.

3. **LGA scope.** A DA outside the user's nominated LGAs gets capped at score 1
   even if otherwise perfect. The user chose their service area.

4. **Trade scope.** A DA with no demolition scope (pure roofing, new build on a
   vacant lot, internal fit-out) gets score 0. Multi-scope DAs are scored on the
   demolition portion only.

5. **Enabling demolition still counts.** When a knock-down rebuild bundles
   demolition + new construction, the demolition is a real lead for a demolition
   subbie — score it 4, not 1. Reserve 1 for demolition that is already done or
   otherwise not part of this DA's scope.

6. **Job size.** A trivial job (< AUD 20k, e.g. removal of a single small shed)
   gets capped at score 2. The wedge user quotes work in the ~AUD 30k–500k band.

7. **Commercial high-rise.** Large commercial / high-rise demolition is out of
   wheelhouse for residential + light-commercial subbies. Cap at score 1.

8. **Personalisation.** If the input includes \`thumbs_examples\`, use them to
   break ties only. Never override the rubric — they shift confidence, not the
   score floor.`;
