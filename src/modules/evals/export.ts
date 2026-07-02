// Ground-truth → promptfoo dataset export logic (issue #19).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Pure functions — NO DB, NO @/lib/env. The DB read lives in
// scripts/export-eval-set.ts; this module only maps rows to the on-disk
// promptfoo case shape and dedupes against the existing hand-written gold set.
// Safe to import from the always-on jsdom suite.

/** One promptfoo test case in evals/rerank/dataset.jsonl. */
export interface EvalCase {
  da_text: string;
  saved_query: string;
  council: string;
  lga_slug: string;
  user_lga_slugs: string[];
  estimated_value: number | null;
  expected_score: number;
  expected_reason_keywords: string[];
  /** Provenance for exported rows: `ground_truth` | `thumb`. Absent = hand-written. */
  source?: string;
  /** Internal DA id for exported rows — lets a later export dedupe on identity. */
  da_id?: string;
}

/**
 * Canonical roofing saved query used for founder-labelled ground truth. Matches
 * the string the 22 hand-written cases use so exported rows sit in the same
 * query context (the wedge is single-trade, single saved query for now).
 */
export const CANONICAL_SAVED_QUERY =
  "roofing replacement and re-roof work in Greater Sydney for residential dwellings";

/**
 * Binary → 0–5 expected-score anchors. The label store is binary (isRelevant),
 * but the dataset carries a 0–5 score so the ±1 calibration assertion still
 * works. Anchors are chosen so the inclusion threshold (3) cleanly partitions
 * them and each side keeps a ±1 band: relevant→4 (assert 3–5), irrelevant→1
 * (assert 0–2).
 */
export const RELEVANT_EXPECTED_SCORE = 4;
export const IRRELEVANT_EXPECTED_SCORE = 1;

/** A ground-truth row joined to its DA, ready to export. */
export interface GroundTruthForExport {
  daId: string;
  council: string;
  /** LGA slug of the DA (may be null when the DA has no mapped LGA). */
  lgaSlug: string | null;
  isRelevant: boolean;
  source: string;
  description: string;
  estimatedValue: number | null;
}

export interface ExportOptions {
  /** Saved-query context stamped on every exported case. */
  savedQuery?: string;
  /** The labeller's nominated LGA scope; defaults to just the DA's own LGA. */
  userLgaSlugs?: string[];
}

/** Map a labelled ground-truth row to a promptfoo case. */
export function groundTruthToEvalCase(gt: GroundTruthForExport, opts: ExportOptions = {}): EvalCase {
  const lgaSlug = gt.lgaSlug ?? gt.council;
  return {
    da_text: gt.description,
    saved_query: opts.savedQuery ?? CANONICAL_SAVED_QUERY,
    council: gt.council,
    lga_slug: lgaSlug,
    user_lga_slugs: opts.userLgaSlugs ?? [lgaSlug],
    estimated_value: gt.estimatedValue,
    expected_score: gt.isRelevant ? RELEVANT_EXPECTED_SCORE : IRRELEVANT_EXPECTED_SCORE,
    // No hand-authored keywords for machine-exported cases; the keyword
    // assertion is made vacuous for these (see metrics.gradeCase).
    expected_reason_keywords: [],
    source: gt.source === "thumb" ? "thumb" : "ground_truth",
    da_id: gt.daId,
  };
}

/** Normalise a DA description for dedupe (whitespace-collapsed, lower-cased). */
export function normalizeDaText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Dedupe keys for a case. Exported rows carry a da_id; hand-written rows carry
 * only text — so a case matches an existing one on *either* the da_id OR the
 * normalised description. Both keys are returned so dedupe can index on both
 * spaces and catch an exported DA whose text already exists as a hand-written
 * case (and vice-versa).
 */
export function caseKeys(c: EvalCase): { id: string | null; text: string } {
  return {
    id: c.da_id ? `id:${c.da_id}` : null,
    text: `txt:${normalizeDaText(c.da_text)}`,
  };
}

/** Parse a JSONL dataset file body into cases (blank lines skipped). */
export function parseJsonl(body: string): EvalCase[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as EvalCase);
}

/** Serialise cases back to JSONL (one compact object per line, trailing newline). */
export function toJsonl(cases: EvalCase[]): string {
  return cases.map((c) => JSON.stringify(c)).join("\n") + "\n";
}

export interface DedupeResult {
  merged: EvalCase[];
  added: number;
  skipped: number;
}

/**
 * Append `incoming` to `existing`, skipping any incoming case whose key already
 * appears in `existing` (dedupe against the hand-written 22 + prior exports).
 * Also dedupes within `incoming` itself. Existing order is preserved.
 */
export function dedupeCases(existing: EvalCase[], incoming: EvalCase[]): DedupeResult {
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  const remember = (c: EvalCase) => {
    const k = caseKeys(c);
    if (k.id) seenIds.add(k.id);
    seenTexts.add(k.text);
  };
  existing.forEach(remember);

  const merged = [...existing];
  let added = 0;
  let skipped = 0;
  for (const c of incoming) {
    const k = caseKeys(c);
    if ((k.id && seenIds.has(k.id)) || seenTexts.has(k.text)) {
      skipped++;
      continue;
    }
    remember(c);
    merged.push(c);
    added++;
  }
  return { merged, added, skipped };
}
