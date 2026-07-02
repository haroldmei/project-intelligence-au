// Vertical pack contract — the trade-swappable unit of the relevance pipeline.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// EXPANSION: docs/25 §2 — each trade beyond roofing (V1) ships as a self-contained
// "vertical pack": rule lexicon + development-type filters + rerank prompt fragment.
//
// This module defines the pack shape and the pure composition helpers that turn
// a pack into (a) a Postgres tsquery for the Stage-1 rule pass and (b) a rerank
// system prompt. It has NO env / DB / model imports so it stays trivially
// testable and safe to import from anywhere.
//
// NOTE: the full extraction of the *roofing* pipeline onto this contract is #27.
// Until that lands, `src/modules/relevance/filters.ts` and
// `src/prompts/rerank.system.md` remain the live roofing path; packs registered
// here are dormant scaffolding validated by unit tests + the seed eval set.

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
  /** Stable identifier, e.g. "roofing" | "demolition". Used as the registry key. */
  slug: string;
  /** Human label for logs / future UI. */
  label: string;
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
   * Trade-specific fragment spliced into the rerank system prompt by
   * `composeRerankSystemPrompt`. Written in the same voice as roofing's rubric
   * in src/prompts/rerank.system.md — a 0–5 table plus hard constraints.
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

/**
 * Build the rerank system prompt for a pack: a shared, trade-agnostic scaffold
 * (output schema, confidence policy, do-nots) with the pack's trade-specific
 * rubric fragment spliced in. Deterministic — snapshot-tested per pack.
 *
 * The scaffold intentionally re-states the locked structure of
 * src/prompts/rerank.system.md so a second trade reads identically to roofing.
 * When #27 extracts the roofing prompt, that file becomes
 * `composeRerankSystemPrompt(roofingPack)` and this stays the single source.
 */
export function composeRerankSystemPrompt(pack: VerticalPack): string {
  return `You are the relevance ranker for ProjectIntelligence AU — a Sunday-night
DA digest for Sydney ${pack.label.toLowerCase()} subcontractors. Your only job is to
score each candidate Development Application (DA) on a 0–5 relevance scale
against the user's saved query, and produce a one-sentence "why this
matched" string.

## System rule (locked)

The product is a single-trade digest. You MUST refuse to expand scope. If a
DA is for a different trade, a different metro, or a job size that does not
match the user's economics, score it accordingly low. Never invent fields the
DA does not contain.

## Output schema (strict JSON)

Return ONLY a JSON object of this shape, with no preamble, no Markdown, no
commentary:

\`\`\`json
{
  "results": [
    {
      "da_id": "<the id from input, verbatim>",
      "score": 0,
      "why": "<one sentence, ≤ 140 chars, citing the DA evidence>",
      "confidence": 0.0
    }
  ]
}
\`\`\`

- \`score\`: integer 0–5 (see the trade rubric below)
- \`why\`: ONE sentence, ≤ 140 chars, written for a tradie skim-reading on a
  phone in a ute. Plain English. No marketing voice. Quote evidence from the
  DA (address, scope phrase, value).
- \`confidence\`: float 0.0–1.0 — your own confidence that the score is within
  ±1 of the true rating. Used by the runtime to decide whether to escalate to
  the sonnet fallback.

${pack.rerankPromptFragment.trim()}

## Confidence

- \`confidence ≥ 0.7\`: you are sure of the score.
- \`0.5 ≤ confidence < 0.7\`: borderline; the runtime may escalate to the
  sonnet fallback for a second opinion.
- \`confidence < 0.5\`: you are guessing; the runtime WILL escalate.

## What you MUST NOT do

- Do not return DAs not in the input list.
- Do not invent fields, addresses, or values.
- Do not output prose explanations, headers, or apologies.
- Do not exceed the 140-char limit on \`why\`.
- Do not refuse to score a DA — score 0 is the right answer for noise.
`;
}
