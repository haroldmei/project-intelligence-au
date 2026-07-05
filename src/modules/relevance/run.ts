// Relevance module orchestrator — wires PipelineDeps to real Prisma queries.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-004, FR-005, FR-006, FR-007, FR-025 | dev-plan §A.5 (cost-cap kill switch)
//
// Called by the digest cron per user. Returns the scored DA list to assemble into a digest.
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import {
  runRelevancePipeline,
  type PipelineOutput,
} from "@/lib/ai/relevance-pipeline";
import { weeklyCostAud, weekStartAEST } from "@/lib/ai/cost-ledger";
import { parseVector } from "@/lib/ai/embeddings";
import { ruleFilter } from "./filters";
import { vectorRank } from "./vector";
import { loadThumbsExamples } from "./thumbs";
import { DIGEST_EMAIL_MAX_CARDS } from "@/modules/digest/constants";
import pino from "pino";

const log = pino({ name: "relevance-run" });

/** AUD 0.13 = weekly equivalent of AUD 0.50/month ceiling (dev-plan §A.5) */
const WEEKLY_COST_CEILING_AUD = 0.13;

export interface RelevanceRunResult extends PipelineOutput {
  /** True if the cost-cap kill switch forced embedding-only ranking (dev-plan §A.5) */
  fallbackUsed: boolean;
}

/**
 * Run the relevance pipeline for a single user.
 * - Checks weekly AI cost ceiling first (dev-plan §A.5).
 * - If ceiling breached: embedding-only (vector rank, no LLM rerank).
 * - Otherwise: full 3-stage pipeline.
 */
export async function runRelevanceForUser(
  userId: string,
  currentRunId?: string,
): Promise<RelevanceRunResult | null> {
  // Load user data
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      lgaBundles: {
        include: { bundle: { include: { lgas: true } } },
      },
    },
  });
  if (!user) return null;
  if (!user.savedQueryText) {
    log.warn({ userId }, "[relevance] user has no saved query — skipping");
    return null;
  }

  // Fetch savedQueryEmbedding via raw SQL — Prisma can't type Unsupported("vector(1536)")
  const embeddingRows = await db.$queryRaw<{ saved_query_embedding: string | null }[]>`
    SELECT saved_query_embedding::text FROM users WHERE id = ${userId}
  `;
  const savedQueryEmbedding = embeddingRows[0]?.saved_query_embedding
    ? parseVector(embeddingRows[0].saved_query_embedding)
    : null;

  if (!savedQueryEmbedding) {
    log.warn({ userId }, "[relevance] user has no saved query embedding — skipping");
    return null;
  }

  // Collect council slugs from all subscribed LGA bundles
  const councilSlugs = user.lgaBundles.flatMap((sub) =>
    sub.bundle.lgas.map((lga) => lga.id),
  );
  if (councilSlugs.length === 0) {
    log.warn({ userId }, "[relevance] user has no LGA subscriptions — skipping");
    return null;
  }

  // Past-digest dedupe — DAs already shown in any prior digest for this
  // user are excluded from this run's candidate pool. Pairs with the
  // 14-day rule-filter lookback (defaultSinceIso in relevance-pipeline.ts):
  // without dedupe, two consecutive Sunday digests would overlap by 7
  // days and re-send the same lead.
  //
  // The current run is excluded from the dedupe (issue #124): on the Sunday
  // retry tick the primary attempt has already persisted THIS run's DigestDa
  // rows, so without the runId filter the retry would exclude its own leads,
  // surface an empty set, and send a "quiet week" email that disagrees with
  // the persisted portal digest. On the primary tick currentRunId matches no
  // rows yet, so this is a no-op there.
  const excludeDaIds = await loadPastDigestDaIds(userId, currentRunId);

  // Cost-cap kill switch check (dev-plan §A.5)
  const weekStart = weekStartAEST();
  const weeklyCost = await weeklyCostAud(userId, weekStart);
  const costCapBreached = weeklyCost > WEEKLY_COST_CEILING_AUD;

  if (costCapBreached) {
    log.warn({ userId, weeklyCost, weekStart }, "[relevance] cost cap breached — embedding-only path");
    Sentry.captureMessage(`AI weekly cost ceiling breached for user ${userId}`, {
      level: "warning",
      tags: { userId, phase: "relevance-cost-cap" },
    });
    return runEmbeddingOnlyPath(userId, savedQueryEmbedding, councilSlugs, excludeDaIds);
  }

  // Full 3-stage pipeline
  const result = await runRelevancePipeline(
    {
      userId,
      savedQueryText: user.savedQueryText,
      savedQueryEmbedding,
      userLgaCouncilSlugs: councilSlugs,
      excludeDaIds,
      // Restore the wedge's 5–15 email range (issue #11). SMS is re-trimmed to
      // top-3 downstream in assembleAndSendDigest.
      maxDigestSize: DIGEST_EMAIL_MAX_CARDS,
    },
    {
      ruleFilter,
      vectorRank,
      loadThumbsExamples,
    },
  );

  // Sentry alert if per-user cost now exceeds ceiling after this run
  const newCost = await weeklyCostAud(userId, weekStart);
  if (newCost > WEEKLY_COST_CEILING_AUD) {
    Sentry.captureMessage(`AI weekly cost ceiling breached after digest run for user ${userId}`, {
      level: "warning",
      tags: { userId, phase: "relevance-post-run" },
    });
  }

  return { ...result, fallbackUsed: false };
}

/**
 * Embedding-only path — skips the LLM rerank stage.
 * Used when the cost-cap kill switch fires (dev-plan §A.5).
 * Returns the top-5 candidates by cosine similarity only.
 */
async function runEmbeddingOnlyPath(
  userId: string,
  userEmbedding: number[],
  councilSlugs: string[],
  excludeDaIds: string[],
): Promise<RelevanceRunResult> {
  const sinceIsoDate = lookbackIsoDate(14);
  const ruleFiltered = await ruleFilter({ userId, councilSlugs, sinceIsoDate, excludeDaIds });
  const vectorRanked = await vectorRank({
    userId,
    candidates: ruleFiltered,
    userEmbedding,
    topK: 5,
  });

  return {
    results: vectorRanked.map((c, i) => ({
      daId: c.daId,
      score: 5 - i, // synthetic descending score
      why: "Matches your roofing query",
      confidence: 0,
      modelUsed: "embedding-only",
      candidate: c,
    })),
    stats: {
      ruleFiltered: ruleFiltered.length,
      vectorRanked: vectorRanked.length,
      rerankInput: 0,
      rerankSurfaced: vectorRanked.length,
    },
    fallbackUsed: true,
  };
}

function lookbackIsoDate(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/**
 * Internal DA ids the user has been shown in any previous digest. Used to
 * dedupe across the 14-day rule-filter window so a DA seen last Sunday
 * doesn't reappear this Sunday.
 *
 * `currentRunId`, when supplied, is excluded so the retry tick doesn't dedupe
 * against its OWN run's already-persisted DigestDa rows (issue #124).
 */
async function loadPastDigestDaIds(
  userId: string,
  currentRunId?: string,
): Promise<string[]> {
  const rows = await db.digestDa.findMany({
    where: {
      digest: currentRunId
        ? { userId, runId: { not: currentRunId } }
        : { userId },
    },
    select: { daId: true },
    distinct: ["daId"],
  });
  return rows.map((r) => r.daId);
}
