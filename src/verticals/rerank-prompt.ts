// Rerank system-prompt composition (#27). The base template
// (src/prompts/rerank.system.base.md) is trade-agnostic; each vertical pack
// contributes the trade-specific rubric + hard constraints fragment. Composing
// them reproduces the prompt each trade would have shipped by hand — and for
// roofing it is byte-identical to the pre-extraction src/prompts/rerank.system.md
// (locked by src/verticals/roofing/rerank-prompt.test.ts against a golden copy).
//
// fs-only (no @/lib/env, no DB), so it stays safe to import from the always-on
// jsdom test suite and from the server rerank path alike. Read at call time —
// mirroring loadPrompt() in src/lib/ai/rerank.ts — so prompt edits don't need a
// rebuild in dev.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { VerticalPack } from "./types";

const TRADE_PLACEHOLDER = /\{\{trade\}\}/g;
const FRAGMENT_MARKER = "{{rubric_fragment}}";

function loadBaseTemplate(): string {
  return readFileSync(
    path.join(process.cwd(), "src", "prompts", "rerank.system.base.md"),
    "utf-8",
  );
}

/**
 * Build the rerank system prompt for a pack: the shared base template with the
 * trade name substituted and the pack's rubric fragment spliced in where the
 * marker sits (after the output schema, before the confidence policy).
 * Deterministic — snapshot- and golden-tested per pack.
 */
export function composeRerankSystemPrompt(pack: VerticalPack): string {
  return loadBaseTemplate()
    .replace(TRADE_PLACEHOLDER, pack.label.toLowerCase())
    .replace(FRAGMENT_MARKER, () => pack.rerankPromptFragment.trim());
}
