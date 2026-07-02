// Roofing vertical pack — V1, always on. Baseline entry so the registry holds
// ≥ 2 trades and the "second trade" (demolition) has something to sit beside.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies.
//
// SCAFFOLD ONLY. The live roofing rule pass + rerank prompt are still
// src/modules/relevance/filters.ts (ROOFING_KEYWORDS) and
// src/prompts/rerank.system.md — this pack does NOT import them, because that
// module pulls in the server-only DB/env chain and the pack layer must stay
// pure (no DB, no env) so it is safe to import anywhere. Extracting the full
// roofing lexicon onto this contract — and making filters.ts read it from here
// — is #27. Until then this holds a representative subset; nothing consumes it
// at runtime (the demolition pack is the actual #30 deliverable).
import type { VerticalPack } from "../types";

export const roofingPack: VerticalPack = {
  slug: "roofing",
  label: "Roofing",
  defaultSavedQuery:
    "roofing replacement and re-roof work in Greater Sydney for residential dwellings",
  vocabulary: {
    // Representative subset — #27 replaces this with the extracted full lexicon
    // (currently ROOFING_KEYWORDS in src/modules/relevance/filters.ts).
    explicit: [
      "roof",
      "roofing",
      "re-roof",
      "reroof",
      "colorbond",
      "membrane",
      "gutters",
      "downpipes",
    ],
    implicit: [],
  },
  // Roofing has no clean NSW development-type category (it is exempt/implicit
  // work — docs/25 §1.1), so it is vocabulary-only. This is exactly the
  // recall gap that makes demolition the stronger trade #2.
  developmentTypeFilters: [],
  // The live roofing rerank prompt is still src/prompts/rerank.system.md until
  // #27 extracts it; this fragment is a placeholder so the pack is well-formed.
  rerankPromptFragment:
    "## Relevance rubric (0–5) — roofing\n\nSee src/prompts/rerank.system.md (extraction pending #27).",
};
