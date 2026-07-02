// Roofing vertical pack manifest — V1 baseline, always active (no flag).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies.
//
// This is the trade that used to be hardcoded across the relevance pipeline.
// As of #27 the roofing knowledge lives entirely in this pack:
//   - vocabulary.ts        → the Stage-1 tsvector rule pass (via packTsQuery)
//   - prompt-fragment.md   → the trade-specific rubric spliced into the rerank
//                            system prompt (via composeRerankSystemPrompt)
//   - development-types.ts → category filters (empty; roofing is vocab-only)
// The registry resolves `roofing` as its only always-on entry, and
// src/modules/relevance/filters.ts + src/lib/ai/rerank.ts read it from here.
//
// Manifest field mapping (docs/25 §2 uses id / version / display name):
//   slug    = stable id ("roofing")
//   label   = display name ("Roofing")
//   version = pack version, bumped when the vocabulary or fragment changes.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { VerticalPack } from "../types";
import { ROOFING_VOCABULARY } from "./vocabulary";
import { ROOFING_DEVELOPMENT_TYPES } from "./development-types";

// The roofing rubric fragment is authored as markdown (prompt-fragment.md), the
// same way the base template lives in src/prompts. Read at module load via
// process.cwd() — mirroring loadPrompt() in src/lib/ai/rerank.ts — so prompt
// edits don't require a rebuild and the fragment stays inspectable on disk.
const ROOFING_RERANK_FRAGMENT = readFileSync(
  path.join(process.cwd(), "src", "verticals", "roofing", "prompt-fragment.md"),
  "utf-8",
);

export const roofingPack: VerticalPack = {
  slug: "roofing",
  label: "Roofing",
  version: "1.0.0",
  defaultSavedQuery:
    "roofing replacement and re-roof work in Greater Sydney for residential dwellings",
  vocabulary: ROOFING_VOCABULARY,
  developmentTypeFilters: ROOFING_DEVELOPMENT_TYPES,
  rerankPromptFragment: ROOFING_RERANK_FRAGMENT,
};
