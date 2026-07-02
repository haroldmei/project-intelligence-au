// Roofing rule-pass vocabulary — V1 baseline trade. Extracted verbatim from the
// live rule pass (#27): this is the former ROOFING_KEYWORDS array from
// src/modules/relevance/filters.ts, now owned by the pack. filters.ts derives
// its tsquery from this list, so the ORDER and CONTENT here are load-bearing:
// src/verticals/roofing/tsquery.test.ts pins packTsQuery(roofingPack) to an
// exact string, so any edit here is a deliberate behaviour change that must
// update that golden (as #10 did when it appended the CDC re-roof signals).
//
// Two tiers (FR-004):
//   - explicit: DAs that literally call out roofing scope (re-roof, colorbond…).
//   - implicit: construction terms where roofing is implied but not named
//     (every new dwelling needs a roof; alterations to a roof line probably
//     do too). Recall-oriented — the Stage-3 LLM rerank demotes the false
//     positives, so Stage 1 only has to surface plausible candidates.
//
// If precision drops below the 0.85 target, narrow the list back down.
import type { VerticalVocabulary } from "../types";

export const ROOFING_VOCABULARY: VerticalVocabulary = {
  // Tier 1 — explicit roofing
  explicit: [
    "roof",
    "roofing",
    "re-roof",
    "reroof",
    "metal roof",
    "colorbond",
    "colour bond",
    "membrane",
    "gutters",
    "downpipes",
    "skylights",
    "roof tiles",
    "roof replacement",
    "roof restoration",
    "roof repair",
    "insulation",
    "fascia",
    "barge",
    "ridge cap",
    "hip and ridge",
    "sarking",
    "rooflight",
    // CDC re-roof signals (#10). Material-change re-roofs — tile→metal — are the
    // work that flows through the Complying Development Certificate pathway (the
    // like-for-like re-roof is exempt and never filed). These terms surface those
    // CDC records in the Stage-1 rule pass; the reranker (which also sees the
    // approval_pathway field) does the precision work.
    "roof cladding",
    "replacement roof cladding",
    "colorbond conversion",
    "metal deck",
    "recladding",
    "re-sheet",
  ],
  // Tier 2 — roofing-implicit construction (new builds, alterations)
  implicit: [
    "dwelling",
    "residential",
    "alterations",
    "additions",
    "alterations and additions",
    "construction of",
    "single storey",
    "two storey",
    "dual occupancy",
    "secondary dwelling",
  ],
};
