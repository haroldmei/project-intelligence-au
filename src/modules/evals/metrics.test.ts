import { describe, it, expect } from "vitest";
import {
  DEFAULT_INCLUSION_THRESHOLD,
  PRECISION_TARGET,
  RECALL_TARGET,
  resolveThreshold,
  confusionAt,
  precisionRecallF1,
  meetsGate,
  gradeCase,
  rate,
  type ScoredPair,
} from "./metrics";

describe("resolveThreshold", () => {
  it("defaults when absent / empty / non-numeric", () => {
    expect(resolveThreshold(undefined)).toBe(DEFAULT_INCLUSION_THRESHOLD);
    expect(resolveThreshold(null)).toBe(DEFAULT_INCLUSION_THRESHOLD);
    expect(resolveThreshold("")).toBe(DEFAULT_INCLUSION_THRESHOLD);
    expect(resolveThreshold("abc")).toBe(DEFAULT_INCLUSION_THRESHOLD);
  });
  it("parses strings and numbers", () => {
    expect(resolveThreshold("4")).toBe(4);
    expect(resolveThreshold(2)).toBe(2);
  });
  it("clamps into the 0–5 band", () => {
    expect(resolveThreshold(9)).toBe(5);
    expect(resolveThreshold(-3)).toBe(0);
  });
});

describe("confusionAt", () => {
  it("classifies each pair at the threshold", () => {
    const pairs: ScoredPair[] = [
      { predicted: 5, expected: 4 }, // tp
      { predicted: 4, expected: 1 }, // fp
      { predicted: 1, expected: 5 }, // fn
      { predicted: 0, expected: 0 }, // tn
      { predicted: 3, expected: 3 }, // tp (boundary inclusive)
    ];
    expect(confusionAt(pairs, 3)).toEqual({ tp: 2, fp: 1, fn: 1, tn: 1 });
  });

  it("is threshold-sensitive", () => {
    const pairs: ScoredPair[] = [{ predicted: 2, expected: 2 }];
    expect(confusionAt(pairs, 3)).toEqual({ tp: 0, fp: 0, fn: 0, tn: 1 });
    expect(confusionAt(pairs, 2)).toEqual({ tp: 1, fp: 0, fn: 0, tn: 0 });
  });
});

describe("precisionRecallF1", () => {
  it("computes precision, recall and F1", () => {
    const pairs: ScoredPair[] = [
      { predicted: 5, expected: 5 }, // tp
      { predicted: 4, expected: 4 }, // tp
      { predicted: 4, expected: 1 }, // fp
      { predicted: 1, expected: 4 }, // fn
      { predicted: 0, expected: 0 }, // tn
    ];
    const m = precisionRecallF1(pairs, 3);
    expect(m.tp).toBe(2);
    expect(m.fp).toBe(1);
    expect(m.fn).toBe(1);
    expect(m.tn).toBe(1);
    expect(m.n).toBe(5);
    expect(m.threshold).toBe(3);
    expect(m.precision).toBeCloseTo(2 / 3, 6);
    expect(m.recall).toBeCloseTo(2 / 3, 6);
    expect(m.f1).toBeCloseTo(2 / 3, 6);
  });

  it("perfect separation → 1.0 across the board", () => {
    const m = precisionRecallF1(
      [
        { predicted: 5, expected: 5 },
        { predicted: 0, expected: 0 },
      ],
      3,
    );
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.f1).toBe(1);
  });

  it("no positive predictions → precision 0 (never flattered to 1)", () => {
    const m = precisionRecallF1([{ predicted: 0, expected: 5 }], 3);
    expect(m.precision).toBe(0);
    expect(m.recall).toBe(0);
    expect(m.f1).toBe(0);
  });

  it("no truly-relevant cases → recall 0", () => {
    const m = precisionRecallF1([{ predicted: 5, expected: 0 }], 3);
    expect(m.precision).toBe(0); // the one positive prediction is wrong
    expect(m.recall).toBe(0);
  });

  it("defaults the threshold when omitted", () => {
    const m = precisionRecallF1([{ predicted: 3, expected: 3 }]);
    expect(m.threshold).toBe(DEFAULT_INCLUSION_THRESHOLD);
    expect(m.tp).toBe(1);
  });
});

describe("meetsGate", () => {
  it("passes only when both targets are met", () => {
    expect(meetsGate({ precision: 0.75, recall: 0.65 })).toBe(true);
    expect(meetsGate({ precision: PRECISION_TARGET, recall: RECALL_TARGET })).toBe(true);
    expect(meetsGate({ precision: 0.69, recall: 0.9 })).toBe(false);
    expect(meetsGate({ precision: 0.9, recall: 0.59 })).toBe(false);
  });
  it("respects custom targets", () => {
    expect(meetsGate({ precision: 0.6, recall: 0.5 }, 0.6, 0.5)).toBe(true);
  });
});

describe("gradeCase", () => {
  it("within1 on exact and off-by-one", () => {
    expect(gradeCase({ score: 4, why: "x", confidence: 0.9 }, { expected_score: 5 }).within1).toBe(true);
    expect(gradeCase({ score: 3, why: "x", confidence: 0.9 }, { expected_score: 5 }).within1).toBe(false);
  });

  it("keywordHit is case-insensitive and matches any keyword", () => {
    const g = gradeCase(
      { score: 5, why: "Full re-roof with COLORBOND in Penrith", confidence: 0.9 },
      { expected_score: 5, expected_reason_keywords: ["colorbond", "nope"] },
    );
    expect(g.keywordHit).toBe(true);
  });

  it("keywordHit is vacuously true when no keywords are supplied (exported rows)", () => {
    const g = gradeCase({ score: 4, why: "anything", confidence: 0.5 }, { expected_score: 4 });
    expect(g.keywordHit).toBe(true);
    const g2 = gradeCase(
      { score: 4, why: "anything", confidence: 0.5 },
      { expected_score: 4, expected_reason_keywords: [] },
    );
    expect(g2.keywordHit).toBe(true);
  });

  it("keywordHit false when a required keyword is missing", () => {
    const g = gradeCase(
      { score: 5, why: "re-roof job", confidence: 0.9 },
      { expected_score: 5, expected_reason_keywords: ["asbestos"] },
    );
    expect(g.keywordHit).toBe(false);
  });

  it("schemaValid rejects out-of-range / non-integer / over-long output", () => {
    expect(gradeCase({ score: 3, why: "ok", confidence: 0.5 }, { expected_score: 3 }).schemaValid).toBe(true);
    expect(gradeCase({ score: 6, why: "ok", confidence: 0.5 }, { expected_score: 3 }).schemaValid).toBe(false);
    expect(gradeCase({ score: 2.5, why: "ok", confidence: 0.5 }, { expected_score: 3 }).schemaValid).toBe(false);
    expect(gradeCase({ score: 3, why: "x".repeat(141), confidence: 0.5 }, { expected_score: 3 }).schemaValid).toBe(false);
    expect(gradeCase({ score: 3, why: "ok", confidence: 1.5 }, { expected_score: 3 }).schemaValid).toBe(false);
  });
});

describe("rate", () => {
  it("fraction of true, 1 for empty", () => {
    expect(rate([])).toBe(1);
    expect(rate([true, false, true, true])).toBeCloseTo(0.75, 6);
    expect(rate([false, false])).toBe(0);
  });
});
