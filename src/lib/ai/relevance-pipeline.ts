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
    /** DA internal ids already shown to this user in any past digest. */
    excludeDaIds?: string[];
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
  /** Defaults to "now() - 14 days" formatted yyyy-mm-dd */
  sinceIsoDate?: string;
  /** How many to send to the LLM rerank stage. Default 30 per contract. */
  topKForRerank?: number;
  /**
   * Min score (0–5) from rerank to surface in digest.
   *
   * Default 0 — accept everything the LLM scored. The pipeline already has
   * three earlier filters (rule keyword match, council scope, vector cosine
   * top-K) so anything reaching the rerank is at least loosely relevant.
   * The LLM's score is non-deterministic at default temperature, so applying
   * a hard floor here turns variance into "the digest sometimes has 4 cards
   * instead of 5." Top-N cap at `maxDigestSize` is the only meaningful bound.
   */
  minScoreForDigest?: number;
  /**
   * Hard ceiling on digest size. Default 5 — top-5 by rank is the wedge
   * promise; over-large digests dilute the "best of the week" framing.
   */
  maxDigestSize?: number;
  /**
   * DA internal ids already shown to this user in any past digest. The
   * widened lookback window (14 days) overlaps consecutive Sunday digests,
   * so without this filter the same DA would re-appear next week.
   */
  excludeDaIds?: string[];
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
 * Default 14 days back from today (UTC) — matches the DAEX "On Exhibition"
 * window length so a DA exhibited at the start of a council's window is
 * still surfaceable when next Sunday's digest fires. Past-digest dedupe in
 * the rule filter prevents the wider window from causing duplicate sends.
 */
function defaultSinceIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 14);
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
  const minScoreForDigest = input.minScoreForDigest ?? 0;
  const maxDigestSize = input.maxDigestSize ?? 5;

  // Stage 1 — rule pass
  const ruleFiltered = await deps.ruleFilter({
    userId: input.userId,
    councilSlugs: input.userLgaCouncilSlugs,
    sinceIsoDate,
    excludeDaIds: input.excludeDaIds,
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
