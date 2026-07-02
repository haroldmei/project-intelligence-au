// Precision / recall / F1 machinery for the rerank gold set (issue #19).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2 (ai.eval_harness / eval_launch_gate)
//
// Pure functions — NO DB, NO @/lib/env, NO Anthropic. Safe to import from the
// always-on jsdom test suite (see vitest.fe.config.ts). The launch gate the
// wedge doc §5.2/§5.4 and docs/24 G5 pin is "precision ≥ 0.7 at recall ≥ 0.6 on
// the labelled set"; this module turns (predicted score, gold score) pairs into
// that number at a fixed digest-inclusion threshold.

/**
 * Digest-inclusion score threshold. A DA is treated as "included / predicted
 * relevant" when the ranker scores it ≥ this value, and as "truly relevant"
 * when its gold score is ≥ this value.
 *
 * 3 is the rubric boundary (src/verticals/roofing/prompt-fragment.md): score 3
 * is "possible match … worth surfacing for human triage", 2 is "weak … surface
 * only if recall is more important than precision". So ≥ 3 is the natural
 * "goes in the digest" line and gives precision/recall a meaningful cut.
 */
export const DEFAULT_INCLUSION_THRESHOLD = 3;

/** Launch-gate targets (docs/24 G5 success metric / issue #19 title). */
export const PRECISION_TARGET = 0.7;
export const RECALL_TARGET = 0.6;

/** A single graded case: what the model scored vs. the gold expected score. */
export interface ScoredPair {
  /** Model's predicted 0–5 relevance score. */
  predicted: number;
  /** Gold / expected 0–5 relevance score. */
  expected: number;
}

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface PrecisionRecall extends Confusion {
  /** Number of pairs scored. */
  n: number;
  /** Inclusion threshold used to binarise scores. */
  threshold: number;
  /** tp / (tp + fp); 0 when nothing was predicted relevant. */
  precision: number;
  /** tp / (tp + fn); 0 when there are no truly-relevant cases. */
  recall: number;
  /** Harmonic mean of precision and recall; 0 when both are 0. */
  f1: number;
}

/**
 * Parse / clamp a raw inclusion-threshold value (e.g. from an env var). Returns
 * the default when the value is absent or not a finite number; clamps into the
 * valid 0–5 score band otherwise.
 */
export function resolveThreshold(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_INCLUSION_THRESHOLD;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_INCLUSION_THRESHOLD;
  return Math.min(5, Math.max(0, n));
}

/** Build the 2×2 confusion matrix at a score threshold. */
export function confusionAt(pairs: ScoredPair[], threshold: number): Confusion {
  const c: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const { predicted, expected } of pairs) {
    const predRelevant = predicted >= threshold;
    const goldRelevant = expected >= threshold;
    if (predRelevant && goldRelevant) c.tp++;
    else if (predRelevant && !goldRelevant) c.fp++;
    else if (!predRelevant && goldRelevant) c.fn++;
    else c.tn++;
  }
  return c;
}

/**
 * Precision, recall and F1 at the given inclusion threshold.
 *
 * Divide-by-zero convention (launch-gate-safe): precision is 0 when the ranker
 * predicted nothing relevant (tp+fp=0) and recall is 0 when the set has no
 * truly-relevant cases (tp+fn=0) — we never flatter the number by treating an
 * empty denominator as a perfect 1.0.
 */
export function precisionRecallF1(
  pairs: ScoredPair[],
  threshold: number = DEFAULT_INCLUSION_THRESHOLD,
): PrecisionRecall {
  const { tp, fp, fn, tn } = confusionAt(pairs, threshold);
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, tn, n: pairs.length, threshold, precision, recall, f1 };
}

/** Whether a metrics result clears the launch gate (both targets met). */
export function meetsGate(
  m: Pick<PrecisionRecall, "precision" | "recall">,
  precisionTarget: number = PRECISION_TARGET,
  recallTarget: number = RECALL_TARGET,
): boolean {
  return m.precision >= precisionTarget && m.recall >= recallTarget;
}

// ─── Per-case grading (mirrors the promptfoo assertions) ───────────────────────

export interface ModelScore {
  score: number;
  why: string;
  confidence: number;
}

export interface GoldExpectations {
  expected_score: number;
  expected_reason_keywords?: string[];
}

export interface CaseGrade {
  /** |predicted − expected| ≤ 1 — the strict score-calibration assertion. */
  within1: boolean;
  /** `why` contains ≥ 1 expected keyword (vacuously true when none are given). */
  keywordHit: boolean;
  /** Output shape is sane: score 0–5 int, why ≤ 140 chars, confidence 0–1. */
  schemaValid: boolean;
}

/** Grade one model output against its gold expectations. */
export function gradeCase(out: ModelScore, gold: GoldExpectations): CaseGrade {
  const within1 = Math.abs(out.score - gold.expected_score) <= 1;

  const keywords = gold.expected_reason_keywords ?? [];
  const why = (out.why || "").toLowerCase();
  // Exported / thumb-derived cases carry no keywords — treat that as a pass so
  // they don't drag the keyword rate down; the hand-written 22 still assert.
  const keywordHit = keywords.length === 0 ? true : keywords.some((k) => why.includes(k.toLowerCase()));

  const schemaValid =
    typeof out.score === "number" &&
    Number.isInteger(out.score) &&
    out.score >= 0 &&
    out.score <= 5 &&
    typeof out.why === "string" &&
    out.why.length <= 140 &&
    typeof out.confidence === "number" &&
    out.confidence >= 0 &&
    out.confidence <= 1;

  return { within1, keywordHit, schemaValid };
}

/** Fraction of `true` values, or 1 for an empty list (nothing to fail). */
export function rate(flags: boolean[]): number {
  if (flags.length === 0) return 1;
  return flags.filter(Boolean).length / flags.length;
}
