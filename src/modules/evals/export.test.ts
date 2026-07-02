import { describe, it, expect } from "vitest";
import {
  CANONICAL_SAVED_QUERY,
  RELEVANT_EXPECTED_SCORE,
  IRRELEVANT_EXPECTED_SCORE,
  groundTruthToEvalCase,
  normalizeDaText,
  caseKeys,
  parseJsonl,
  toJsonl,
  dedupeCases,
  type EvalCase,
  type GroundTruthForExport,
} from "./export";

const gt: GroundTruthForExport = {
  daId: "da_1",
  council: "penrith",
  lgaSlug: "penrith",
  isRelevant: true,
  source: "manual",
  description: "Full re-roof with Colorbond metal sheeting.",
  estimatedValue: 165000,
};

describe("groundTruthToEvalCase", () => {
  it("maps a relevant label to the relevant anchor score", () => {
    const c = groundTruthToEvalCase(gt);
    expect(c).toMatchObject({
      da_text: gt.description,
      saved_query: CANONICAL_SAVED_QUERY,
      council: "penrith",
      lga_slug: "penrith",
      user_lga_slugs: ["penrith"],
      estimated_value: 165000,
      expected_score: RELEVANT_EXPECTED_SCORE,
      expected_reason_keywords: [],
      source: "ground_truth",
      da_id: "da_1",
    });
  });

  it("maps an irrelevant label to the irrelevant anchor score", () => {
    const c = groundTruthToEvalCase({ ...gt, isRelevant: false });
    expect(c.expected_score).toBe(IRRELEVANT_EXPECTED_SCORE);
  });

  it("flags thumb-sourced rows and falls back lga_slug to council", () => {
    const c = groundTruthToEvalCase({ ...gt, source: "thumb", lgaSlug: null });
    expect(c.source).toBe("thumb");
    expect(c.lga_slug).toBe("penrith");
    expect(c.user_lga_slugs).toEqual(["penrith"]);
  });

  it("honours explicit saved query and LGA scope options", () => {
    const c = groundTruthToEvalCase(gt, { savedQuery: "custom q", userLgaSlugs: ["a", "b"] });
    expect(c.saved_query).toBe("custom q");
    expect(c.user_lga_slugs).toEqual(["a", "b"]);
  });
});

describe("normalizeDaText / caseKeys", () => {
  it("collapses whitespace and lower-cases", () => {
    expect(normalizeDaText("  Re-Roof   the\nDwelling ")).toBe("re-roof the dwelling");
  });
  it("returns an id key (when present) and always a text key", () => {
    expect(caseKeys({ da_id: "x", da_text: "Re Roof" } as EvalCase)).toEqual({
      id: "id:x",
      text: "txt:re roof",
    });
    expect(caseKeys({ da_text: "Re Roof" } as EvalCase)).toEqual({ id: null, text: "txt:re roof" });
  });
});

describe("parseJsonl / toJsonl", () => {
  it("round-trips, skipping blank lines", () => {
    const cases = parseJsonl(toJsonl([groundTruthToEvalCase(gt)]) + "\n\n");
    expect(cases).toHaveLength(1);
    expect(cases[0].da_id).toBe("da_1");
  });
  it("toJsonl ends with a single trailing newline", () => {
    expect(toJsonl([groundTruthToEvalCase(gt)]).endsWith("}\n")).toBe(true);
  });
});

describe("dedupeCases", () => {
  const handWritten: EvalCase = {
    da_text: "Existing dwelling — full re-roof with Colorbond.",
    saved_query: CANONICAL_SAVED_QUERY,
    council: "penrith",
    lga_slug: "penrith",
    user_lga_slugs: ["penrith"],
    estimated_value: 165000,
    expected_score: 5,
    expected_reason_keywords: ["re-roof", "Colorbond"],
  };

  it("appends new cases and preserves existing order", () => {
    const incoming = [groundTruthToEvalCase({ ...gt, daId: "da_2" })];
    const { merged, added, skipped } = dedupeCases([handWritten], incoming);
    expect(added).toBe(1);
    expect(skipped).toBe(0);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(handWritten);
  });

  it("dedupes an exported case against a hand-written one by normalised text", () => {
    // Same description as handWritten (whitespace/case differ), no da_id match.
    const dupText: GroundTruthForExport = {
      ...gt,
      daId: "da_9",
      description: "EXISTING dwelling —   full re-roof with Colorbond.",
    };
    const { added, skipped } = dedupeCases([handWritten], [groundTruthToEvalCase(dupText)]);
    expect(added).toBe(0);
    expect(skipped).toBe(1);
  });

  it("dedupes within the incoming batch (same da_id twice)", () => {
    const a = groundTruthToEvalCase({ ...gt, daId: "da_5" });
    const b = groundTruthToEvalCase({ ...gt, daId: "da_5", description: "different text" });
    const { added, skipped, merged } = dedupeCases([], [a, b]);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(merged).toHaveLength(1);
  });
});
