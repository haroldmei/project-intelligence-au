// #27 zero-behaviour-change lock for the roofing rerank prompt.
//
// The roofing system prompt used to be a single hand-maintained file
// (src/prompts/rerank.system.md). It is now composed from the shared base
// template + the roofing pack's fragment. This test proves that composition is
// BYTE-IDENTICAL to a golden copy of the original file, so the extraction
// changed no model input. It also guards the acceptance criterion that no
// roofing vocabulary literals leak into the base template.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeRerankSystemPrompt } from "../rerank-prompt";
import { roofingPack } from "./pack";

const golden = readFileSync(
  path.join(
    process.cwd(),
    "__tests__",
    "relevance",
    "fixtures",
    "rerank.system.roofing.golden.md",
  ),
  "utf-8",
);

const base = readFileSync(
  path.join(process.cwd(), "src", "prompts", "rerank.system.base.md"),
  "utf-8",
);

describe("composeRerankSystemPrompt(roofingPack) — zero behaviour change", () => {
  it("is byte-identical to the pre-extraction rerank.system.md", () => {
    expect(composeRerankSystemPrompt(roofingPack)).toBe(golden);
  });

  it("embeds the pack's rubric fragment verbatim", () => {
    expect(composeRerankSystemPrompt(roofingPack)).toContain(
      roofingPack.rerankPromptFragment.trim(),
    );
  });
});

describe("base template — no roofing vocabulary literals (acceptance)", () => {
  it("carries the {{trade}} / {{rubric_fragment}} placeholders, not roofing terms", () => {
    expect(base).toContain("{{trade}}");
    expect(base).toContain("{{rubric_fragment}}");
    for (const term of [
      "roofing",
      "re-roof",
      "colorbond",
      "gutters",
      "membrane",
      "sarking",
    ]) {
      expect(base.toLowerCase()).not.toContain(term);
    }
  });
});
