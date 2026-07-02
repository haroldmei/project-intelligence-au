// Vertical pack contract — the trade-swappable unit of the relevance pipeline.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// EXPANSION: docs/25 §2 — each trade beyond roofing (V1) ships as a self-contained
// "vertical pack": rule lexicon + development-type filters + rerank prompt fragment.
//
// This module defines the pack shape and the pure tsquery/vocabulary helpers.
// It has NO env / DB / model / fs imports so it stays trivially testable and
// safe to import from anywhere (including the jsdom suite). Rerank-prompt
// composition (which reads template files) lives in ./rerank-prompt.
//
// As of #27 the roofing pipeline is fully extracted onto this contract:
// src/modules/relevance/filters.ts builds its tsquery from roofingPack, and
// src/lib/ai/rerank.ts composes its system prompt from roofingPack. Other
// trades (e.g. demolition) register here dormant behind a flag.

/**
 * Two-tier trade vocabulary, mirroring the roofing rule pass
 * (src/modules/relevance/filters.ts):
 *
 * - `explicit`: terms that literally name the trade's scope of work. A DA
 *   containing one is almost certainly in-trade.
 * - `implicit`: broader construction terms where the trade's work is implied
 *   but not named (e.g. a knock-down-rebuild implies demolition). Recall-
 *   oriented; the Stage-3 LLM rerank demotes the false positives these let
 *   through, so Stage 1 only has to surface plausible candidates.
 */
export interface VerticalVocabulary {
  explicit: string[];
  implicit: string[];
}

export interface VerticalPack {
  /** Stable identifier (docs/25 §2 "id"), e.g. "roofing" | "demolition". Registry key. */
  slug: string;
  /** Human display name for logs / future UI. */
  label: string;
  /** Pack version — bump when the vocabulary or rerank fragment changes. */
  version: string;
  /**
   * Seed saved-query shown as the default for this vertical's onboarding once
   * it launches. Also used as the query text in the pack's eval set.
   */
  defaultSavedQuery: string;
  vocabulary: VerticalVocabulary;
  /**
   * Development-type category strings this pack filters on once per-application
   * development-type persistence (#26) lands. Until then the pipeline falls
   * back to the vocabulary tsquery (see `matchesVocabulary`). An empty list
   * means "vocabulary-only" (roofing's situation — it has no clean DA category).
   */
  developmentTypeFilters: string[];
  /**
   * Trade-specific fragment spliced into the base rerank template by
   * `composeRerankSystemPrompt` (src/verticals/rerank-prompt.ts) at the
   * `{{rubric_fragment}}` marker — a 0–5 rubric table plus hard constraints.
   * See src/verticals/roofing/prompt-fragment.md for the reference shape.
   */
  rerankPromptFragment: string;
}

/** tsquery OR separator, matching the roofing rule pass. */
const TSQUERY_OR = " | ";

/**
 * Compose a keyword list into a PostgreSQL tsquery fragment. Mirrors
 * `buildTsQuery` in src/modules/relevance/filters.ts exactly: lowercase,
 * collapse internal whitespace to the `<->` phrase-adjacency operator, and
 * join with `|`. Duplicates are dropped so overlapping tiers don't bloat the
 * query. Hyphenation is left to `to_tsquery('english', …)`, as roofing does.
 */
export function keywordsToTsQuery(keywords: string[]): string {
  const seen = new Set<string>();
  for (const raw of keywords) {
    const k = raw.trim().toLowerCase();
    if (k) seen.add(k.replace(/\s+/g, "<->"));
  }
  return [...seen].join(TSQUERY_OR);
}

/** The pack's full rule-pass tsquery: explicit ∪ implicit vocabulary. */
export function packTsQuery(pack: VerticalPack): string {
  return keywordsToTsQuery([
    ...pack.vocabulary.explicit,
    ...pack.vocabulary.implicit,
  ]);
}

/**
 * Keyword-fallback classifier for the development-type filter. Used while #26
 * (development-type persistence) is not yet available: instead of matching a
 * stored category enum, we test whether the DA free text contains any of the
 * pack's vocabulary terms. Coarse by design — it mirrors the recall-first
 * intent of the SQL rule pass, and the LLM rerank does the precision work.
 */
export function matchesVocabulary(pack: VerticalPack, text: string): boolean {
  const haystack = text.toLowerCase();
  return [...pack.vocabulary.explicit, ...pack.vocabulary.implicit].some(
    (term) => haystack.includes(term.trim().toLowerCase()),
  );
}
