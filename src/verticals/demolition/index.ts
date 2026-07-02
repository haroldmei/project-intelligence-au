// Demolition vertical pack — trade #2 candidate, dormant behind
// VERTICAL_DEMOLITION_ENABLED (see src/verticals/registry.ts).
// WEDGE: expansion Wave 1, docs/25 §1.1 / §2.
//
// "Built + eval seed, dormant behind a flag" (#30): this pack is fully
// assembled and unit-tested, but nothing user-facing consumes it while the
// flag is off. Launching demolition is a human-owned go/no-go (discovery,
// n≥8) — this file makes that launch a flag-flip.
import type { VerticalPack } from "../types";
import { DEMOLITION_VOCABULARY } from "./vocabulary";
import { DEMOLITION_RERANK_FRAGMENT } from "./prompt";

export const demolitionPack: VerticalPack = {
  slug: "demolition",
  label: "Demolition",
  version: "1.0.0",
  defaultSavedQuery:
    "demolition, knock-down rebuild and site clearance work in Greater Sydney for residential and light-commercial sites",
  vocabulary: DEMOLITION_VOCABULARY,
  // Once #26 (development-type persistence) lands, demolition is
  // category-filterable — it is a named NSW development type (docs/25 §1.1),
  // unlike roofing. The exact enum strings are low-confidence per the research
  // (docs/25 Wave 0 audit), so these are provisional; the pipeline uses the
  // vocabulary keyword fallback (matchesVocabulary) until the audit confirms.
  developmentTypeFilters: [
    "demolition",
    "demolition-only",
    "demolition_and_construction",
  ],
  rerankPromptFragment: DEMOLITION_RERANK_FRAGMENT,
};
