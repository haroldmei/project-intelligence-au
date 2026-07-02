// Demolition rule-pass vocabulary — trade #2 candidate (docs/25 §1.1 / §2).
// WEDGE lineage: mirrors src/modules/relevance/filters.ts ROOFING_KEYWORDS.
//
// Demolition has structurally HIGHER recall in NSW planning data than roofing:
// a DA or CDC is mandatory for nearly all demolition (Codes SEPP General
// Demolition Code), so the explicit tier alone catches most real jobs. Terms
// were refined against the DA description language already present in the
// roofing gold set (evals/rerank/dataset.jsonl) — e.g. "Demolition only —
// removal of existing dwelling and outbuildings. Site to be left clear."
//
// DELIBERATELY EXCLUDED: "strip out" / "strip-out". In DA language that phrase
// means an internal, non-structural soft-strip inside a fit-out — the canonical
// demolition FALSE POSITIVE (see the seed eval negatives). Letting it into the
// rule pass would surface fit-out DAs that the rerank then has to reject; keep
// it out so precision starts higher.
import type { VerticalVocabulary } from "../types";

export const DEMOLITION_VOCABULARY: VerticalVocabulary = {
  // Tier 1 — explicit: the DA literally names demolition scope.
  explicit: [
    "demolition",
    "demolish",
    "demolished",
    "demolishing",
    "partial demolition",
    "full demolition",
    "demolition only",
    "knock-down rebuild",
    "knock down rebuild",
    "asbestos removal",
    "asbestos disposal",
    "hazmat",
    "hazardous materials removal",
    "site clearance",
    "deconstruction",
    "removal of existing dwelling",
    "removal of existing structures",
    "removal of existing building",
  ],
  // Tier 2 — implicit: demolition is implied by the work type but not named.
  // Recall-oriented; the LLM rerank demotes the false positives.
  implicit: [
    "knock down",
    "kdr",
    "vacant possession",
    "make safe",
    "make-safe",
    "dilapidation",
    "removal of outbuildings",
    "outbuildings",
    "site to be left clear",
    "clear the site",
  ],
};
