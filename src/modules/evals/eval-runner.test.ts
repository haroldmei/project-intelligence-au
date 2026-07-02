import { describe, it, expect } from "vitest";
import {
  buildRoofingSystemPrompt,
  renderEvalUserPrompt,
  runRerankEval,
  type ModelCaller,
} from "./eval-runner";
import type { EvalCase } from "./export";

const relevant: EvalCase = {
  da_text: "Existing dwelling — full re-roof with Colorbond metal sheeting.",
  saved_query: "roofing replacement in Greater Sydney",
  council: "penrith",
  lga_slug: "penrith",
  user_lga_slugs: ["penrith", "blacktown"],
  estimated_value: 165000,
  expected_score: 5,
  expected_reason_keywords: ["re-roof", "Colorbond"],
};

const irrelevant: EvalCase = {
  da_text: "Internal fit-out — kitchen, bathroom, electrical only.",
  saved_query: "roofing replacement in Greater Sydney",
  council: "parramatta",
  lga_slug: "parramatta",
  user_lga_slugs: ["parramatta"],
  estimated_value: 40000,
  expected_score: 0,
  expected_reason_keywords: [],
};

describe("buildRoofingSystemPrompt", () => {
  it("composes the base template with the roofing rubric fragment", () => {
    const sys = buildRoofingSystemPrompt();
    expect(sys).toContain("Relevance rubric");
    expect(sys.toLowerCase()).toContain("colorbond");
    // {{trade}} placeholder resolved to roofing, no unfilled markers.
    expect(sys).not.toContain("{{trade}}");
    expect(sys).not.toContain("{{rubric_fragment}}");
  });
});

describe("renderEvalUserPrompt", () => {
  it("substitutes the saved query, LGA scope and DA text", () => {
    const user = renderEvalUserPrompt(relevant);
    expect(user).toContain("roofing replacement in Greater Sydney");
    expect(user).toContain("penrith, blacktown");
    expect(user).toContain("full re-roof with Colorbond");
    // No unfilled mustache sections remain.
    expect(user).not.toContain("{{#each candidates}}");
    expect(user).not.toContain("{{saved_query_text}}");
    expect(user).not.toContain("{{#thumbs_examples}}");
  });
});

describe("runRerankEval", () => {
  // Fake model that mirrors the gold score exactly — perfect separation.
  const perfectCaller: ModelCaller = async ({ evalCase }) => ({
    score: evalCase.expected_score,
    why: evalCase.expected_reason_keywords[0] ?? "matches",
    confidence: 0.9,
  });

  it("produces a passing report on a perfect model", async () => {
    const report = await runRerankEval([relevant, irrelevant], perfectCaller, {
      threshold: 3,
      model: "fake",
    });
    expect(report.n).toBe(2);
    expect(report.model).toBe("fake");
    expect(report.metrics.precision).toBe(1);
    expect(report.metrics.recall).toBe(1);
    expect(report.metrics.f1).toBe(1);
    expect(report.gate.passed).toBe(true);
    expect(report.assertions.within1Pass).toBe(true);
    expect(report.assertions.keywordRate).toBe(1);
    expect(report.cases).toHaveLength(2);
    expect(report.cases[0]).toMatchObject({ predicted: 5, expected: 5, council: "penrith" });
  });

  it("reflects a model that over-includes (false positive) in the metrics", async () => {
    // Scores everything relevant → the irrelevant case becomes a false positive.
    const overCaller: ModelCaller = async () => ({ score: 5, why: "matches", confidence: 0.5 });
    const report = await runRerankEval([relevant, irrelevant], overCaller, {
      threshold: 3,
      model: "fake",
    });
    expect(report.metrics).toMatchObject({ tp: 1, fp: 1, fn: 0 });
    expect(report.metrics.precision).toBeCloseTo(0.5, 6);
    expect(report.metrics.recall).toBe(1);
    expect(report.gate.passed).toBe(false); // precision 0.5 < 0.7
  });

  it("honours custom gate targets", async () => {
    const overCaller: ModelCaller = async () => ({ score: 5, why: "matches", confidence: 0.5 });
    const report = await runRerankEval([relevant, irrelevant], overCaller, {
      threshold: 3,
      model: "fake",
      precisionTarget: 0.5,
      recallTarget: 0.5,
    });
    expect(report.gate.passed).toBe(true);
  });
});
