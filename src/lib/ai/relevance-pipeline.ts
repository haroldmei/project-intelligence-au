// 3-stage relevance pipeline: rule → pgvector → LLM rerank.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2 | Phase: ai-features
//
// Pure orchestration — DB queries are injected via the `deps` parameter
// so the pipeline can be unit-tested without a Postgres dependency. The
// real wiring lives in src/modules/relevance/ (backend-developer phase).
//
// Stages, per system-design §3.3 and contract.ai.relevance_pipeline:
//   1. SQL rule pass: keyword filter (roofing vocabulary + LGA scope)
//   2. pgvector cosine: top-50 by similarity to user.savedQueryEmbedding
//   3. LLM rerank: claude-haiku-4-5 (with sonnet-4-6 fallback)
//
// Returns the final ranked list. Caller (digest module) writes
// digest/digest_das rows.
import {
  rerankCandidates,
  type RerankCandidate,
  type RerankResult,
} from "./rerank";

export interface CandidateDA {
  daId: string;
  council: string;
  address: string;
  description: string;
  rawScopeText: string | null;
  estimatedValue: number | null;
  lodgementDate: string; // yyyy-mm-dd
  applicantName: string | null;
  portalUrl: string;
  /** Cosine similarity from stage 2 — used for tie-break and logging. */
  cosineSimilarity?: number;
}

export interface PipelineDeps {
  /**
   * Stage 1: rule pass. Implementation runs the SQL keyword filter using
   * GIN tsvector on (description || raw_scope_text) over the user's
   * subscribed councils, in the last 7 days. Returns DAs that pass.
   */
  ruleFilter: (args: {
    userId: string;
    councilSlugs: string[];
    sinceIsoDate: string;
  }) => Promise<CandidateDA[]>;

  /**
   * Stage 2: pgvector cosine. Implementation runs the SQL in
   * docs/03-system-design.md §3.4 — joins da_embeddings, orders by
   * (embedding <=> user_embedding), LIMIT topK. Implementation is also
   * responsible for embedding any candidates that don't yet have a row
   * in da_embeddings (one-shot embedBatch call before the join).
   */
  vectorRank: (args: {
    userId: string;
    candidates: CandidateDA[];
    userEmbedding: number[];
    topK: number;
  }) => Promise<CandidateDA[]>;

  /**
   * Optional: load past thumbs to inject into the rerank prompt
   * (FR-025). Returns up to 10 (5 up + 5 down) most-recent thumbs.
   * Pipeline tolerates this returning empty for new users.
   */
  loadThumbsExamples?: (args: {
    userId: string;
  }) => Promise<Array<{ daText: string; feedback: "up" | "down" }>>;
}

export interface PipelineInput {
  userId: string;
  savedQueryText: string;
  savedQueryEmbedding: number[];
  userLgaCouncilSlugs: string[];
  /** Defaults to "now() - 7 days" formatted yyyy-mm-dd */
  sinceIsoDate?: string;
  /** How many to send to the LLM rerank stage. Default 30 per contract. */
  topKForRerank?: number;
  /**
   * Min score (0–5) from rerank to surface in digest.
   *
   * Default 3 — captures "moderately relevant" leads alongside high-precision
   * matches. Was 4 originally, but at 4 a roofer-implicit new-build like
   * "construction of a two storey dwelling" gets dropped because the LLM
   * scores it as 3 against a re-roof-focused saved query — even though every
   * new dwelling actually needs a roof. Threshold of 3 means the digest may
   * include new builds + alterations + additions; LLM still ranks them below
   * explicit re-roofs when both are present.
   *
   * Tighten back to 4 once we have abundant explicit re-roof data.
   */
  minScoreForDigest?: number;
  /** Hard ceiling on digest size (wedge: 5–15 leads). Default 15. */
  maxDigestSize?: number;
}

export interface PipelineOutput {
  /** Final ranked list to put in the digest. May be < 5 in a quiet week. */
  results: Array<RerankResult & { candidate: CandidateDA }>;
  /** Stage stats for logging / observability. */
  stats: {
    ruleFiltered: number;
    vectorRanked: number;
    rerankInput: number;
    rerankSurfaced: number;
  };
}

/**
 * Default 7 days back from today (UTC). Pipeline-internal default; caller
 * can override for backfills or testing.
 */
function defaultSinceIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Run the 3-stage pipeline for one user. Pure orchestration; no DB
 * client imported here — all DB access goes through `deps`.
 */
export async function runRelevancePipeline(
  input: PipelineInput,
  deps: PipelineDeps,
): Promise<PipelineOutput> {
  const sinceIsoDate = input.sinceIsoDate ?? defaultSinceIso();
  const topKForRerank = input.topKForRerank ?? 30;
  const minScoreForDigest = input.minScoreForDigest ?? 3;
  const maxDigestSize = input.maxDigestSize ?? 15;

  // Stage 1 — rule pass
  const ruleFiltered = await deps.ruleFilter({
    userId: input.userId,
    councilSlugs: input.userLgaCouncilSlugs,
    sinceIsoDate,
  });

  if (ruleFiltered.length === 0) {
    return {
      results: [],
      stats: {
        ruleFiltered: 0,
        vectorRanked: 0,
        rerankInput: 0,
        rerankSurfaced: 0,
      },
    };
  }

  // Stage 2 — pgvector cosine
  const vectorRanked = await deps.vectorRank({
    userId: input.userId,
    candidates: ruleFiltered,
    userEmbedding: input.savedQueryEmbedding,
    topK: topKForRerank,
  });

  if (vectorRanked.length === 0) {
    return {
      results: [],
      stats: {
        ruleFiltered: ruleFiltered.length,
        vectorRanked: 0,
        rerankInput: 0,
        rerankSurfaced: 0,
      },
    };
  }

  // Stage 3 — LLM rerank
  const thumbsExamples = deps.loadThumbsExamples
    ? await deps.loadThumbsExamples({ userId: input.userId })
    : [];

  const rerankInput: RerankCandidate[] = vectorRanked.map((c) => ({
    daId: c.daId,
    council: c.council,
    address: c.address,
    description: c.description,
    rawScopeText: c.rawScopeText,
    estimatedValue: c.estimatedValue,
    lodgementDate: c.lodgementDate,
  }));

  const rerankResults = await rerankCandidates(
    {
      userId: input.userId,
      savedQueryText: input.savedQueryText,
      savedQueryEmbedding: input.savedQueryEmbedding,
      userLgaSlugs: input.userLgaCouncilSlugs,
      candidates: rerankInput,
      thumbsExamples,
    },
    { topN: maxDigestSize, minScore: minScoreForDigest },
  );

  // Re-attach the source candidate for downstream digest rendering
  const candidateById = new Map(vectorRanked.map((c) => [c.daId, c]));
  const results = rerankResults
    .map((r) => {
      const candidate = candidateById.get(r.daId);
      if (!candidate) return null;
      return { ...r, candidate };
    })
    .filter((x): x is RerankResult & { candidate: CandidateDA } => x !== null);

  return {
    results,
    stats: {
      ruleFiltered: ruleFiltered.length,
      vectorRanked: vectorRanked.length,
      rerankInput: rerankInput.length,
      rerankSurfaced: results.length,
    },
  };
}
