// Relevance module orchestrator — wires PipelineDeps to real Prisma queries.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-004, FR-005, FR-006, FR-007, FR-025 | dev-plan §A.5 (cost-cap kill switch)
//
// Called by the digest cron per user. Returns the scored DA list to assemble into a digest.
import * as Sentry from "@sentry/nextjs";
import {
  APIConnectionError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import {
  runRelevancePipeline,
  type PipelineOutput,
} from "@/lib/ai/relevance-pipeline";
import { DIGEST_MIN_RERANK_SCORE } from "@/lib/ai/rerank";
import { weeklyCostAud, weekStartAEST } from "@/lib/ai/cost-ledger";
import { parseVector } from "@/lib/ai/embeddings";
import { ruleFilter } from "./filters";
import { vectorRank } from "./vector";
import { loadThumbsExamples } from "./thumbs";
import { DIGEST_EMAIL_MAX_CARDS, DIGEST_EMAIL_MIN_CARDS } from "@/modules/digest/constants";
import pino from "pino";

const log = pino({ name: "relevance-run" });

/** AUD 0.13 = weekly equivalent of AUD 0.50/month ceiling (dev-plan §A.5) */
const WEEKLY_COST_CEILING_AUD = 0.13;

/**
 * Why the embedding-only degraded path ran, when {@link RelevanceRunResult.fallbackUsed}.
 * - `cost_cap`        — weekly AI cost ceiling breached (dev-plan §A.5).
 * - `llm_unavailable` — the Claude rerank was unavailable (429/5xx/timeout) and
 *   we degraded rather than dropping the digest (system-design §7.3, NFR-019).
 * The two drive distinct email copy so a user (and support) can tell a cost
 * throttle apart from a transient upstream outage.
 */
export type FallbackReason = "cost_cap" | "llm_unavailable";

export interface RelevanceRunResult extends PipelineOutput {
  /** True if a degraded path forced embedding-only ranking (cost cap or LLM outage). */
  fallbackUsed: boolean;
  /** Present iff `fallbackUsed` — which degraded path produced this result. */
  fallbackReason?: FallbackReason;
}

/**
 * True for the transient Anthropic failures system-design §7.3 says must degrade
 * the digest to embedding-only rather than drop it: 429 rate limits, 5xx/529
 * overloads, and connection timeouts (after the SDK's own retries are exhausted).
 *
 * Deliberately NARROW: a 4xx like 401 (bad key) or 400 (malformed request) is a
 * config/logic bug, not an outage — those keep propagating so the cron records a
 * hard failure and the unserved alert pages, instead of silently shipping a
 * "basic mode" digest every week and masking a broken deploy.
 */
function isAnthropicOutage(err: unknown): boolean {
  return (
    err instanceof APIConnectionError || // includes APIConnectionTimeoutError
    err instanceof RateLimitError || // 429
    err instanceof InternalServerError // 5xx / 529 overloaded
  );
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
    return runEmbeddingOnlyPath(userId, savedQueryEmbedding, councilSlugs, excludeDaIds, "cost_cap");
  }

  // Full 3-stage pipeline. The Claude rerank is the only external dependency the
  // embedding-only path doesn't share, so a transient Anthropic outage
  // (429/5xx/timeout) is caught here and degraded to embedding-only ranking —
  // the user still gets a Sunday digest, just ranked by cosine similarity with a
  // "basic mode" note (system-design §7.3, NFR-019 ≥99% delivery SLA). Any other
  // error (DB failures in the rule/vector stages, a non-transient 4xx from the
  // model) propagates to the cron's per-user hard-failure branch as before.
  let result: PipelineOutput;
  try {
    result = await runRelevancePipeline(
      {
        userId,
        savedQueryText: user.savedQueryText,
        savedQueryEmbedding,
        userLgaCouncilSlugs: councilSlugs,
        excludeDaIds,
        // Restore the wedge's 5–15 email range (issue #11). SMS is re-trimmed to
        // top-3 downstream in assembleAndSendDigest.
        maxDigestSize: DIGEST_EMAIL_MAX_CARDS,
        // FR-006 relevance floor (issue #163): only DAs the rerank scored
        // relevance_score ≥ 4 (rubric ≥ 2) may surface. Passed explicitly so the
        // production floor is legible at the call site, not left to a default that
        // once silently sat at 0 and shipped 0/10 DAs as leads.
        minScoreForDigest: DIGEST_MIN_RERANK_SCORE,
      },
      {
        ruleFilter,
        vectorRank,
        loadThumbsExamples,
      },
    );
  } catch (err) {
    if (!isAnthropicOutage(err)) throw err;
    log.warn(
      { userId, err },
      "[relevance] Claude rerank unavailable — degrading to embedding-only (basic mode)",
    );
    Sentry.captureMessage(`Rerank degraded to embedding-only for user ${userId} (Anthropic unavailable)`, {
      level: "warning",
      tags: { userId, phase: "relevance-llm-fallback" },
    });
    return runEmbeddingOnlyPath(userId, savedQueryEmbedding, councilSlugs, excludeDaIds, "llm_unavailable");
  }

  // Sentry alert if per-user cost now exceeds ceiling after this run. Runs
  // before the quiet-week gate below because the rerank incurred its cost
  // regardless of whether the run ends up surfacing any leads.
  const newCost = await weeklyCostAud(userId, weekStart);
  if (newCost > WEEKLY_COST_CEILING_AUD) {
    Sentry.captureMessage(`AI weekly cost ceiling breached after digest run for user ${userId}`, {
      level: "warning",
      tags: { userId, phase: "relevance-post-run" },
    });
  }

  // FR-006 quiet-week gate (issue #163): a real digest is 5–15 DAs that clear
  // the relevance floor. If fewer than DIGEST_EMAIL_MIN_CARDS cleared it, this
  // is a quiet week — surface nothing rather than padding the email with a
  // handful of borderline leads, so assemble sends the FR-010 reassurance email
  // ("we checked N DAs, nothing strong"). `stats` (incl. ruleFiltered) is kept
  // so that email can still report how many DAs were actually checked.
  if (result.results.length > 0 && result.results.length < DIGEST_EMAIL_MIN_CARDS) {
    log.info(
      { userId, cleared: result.results.length, floor: DIGEST_EMAIL_MIN_CARDS },
      "[relevance] quiet week — fewer than the minimum leads cleared the relevance floor",
    );
    return { ...result, results: [], fallbackUsed: false };
  }

  return { ...result, fallbackUsed: false };
}

/**
 * Embedding-only path — skips the LLM rerank stage.
 * Used when the cost-cap kill switch fires (dev-plan §A.5) or when the Claude
 * rerank is unavailable (system-design §7.3). `reason` records which so the
 * digest email can show the matching note.
 *
 * Ranks by cosine similarity only (no LLM), but is held to the SAME two
 * digest-shape guarantees as the full pipeline (issue #201):
 *   - it builds up to DIGEST_EMAIL_MAX_CARDS candidates, not a hard-coded top-5,
 *     so a busy degraded week can still surface the wedge's full 5–15 leads;
 *   - it applies the FR-006 quiet-week floor: if fewer than DIGEST_EMAIL_MIN_CARDS
 *     candidates survive, it surfaces NOTHING so assemble sends the FR-010
 *     reassurance email — never a thin 1–4-lead digest that skipped every
 *     relevance floor while wearing a passing relevance pip.
 */
async function runEmbeddingOnlyPath(
  userId: string,
  userEmbedding: number[],
  councilSlugs: string[],
  excludeDaIds: string[],
  reason: FallbackReason,
): Promise<RelevanceRunResult> {
  const sinceIsoDate = lookbackIsoDate(14);
  const ruleFiltered = await ruleFilter({ userId, councilSlugs, sinceIsoDate, excludeDaIds });
  const vectorRanked = await vectorRank({
    userId,
    candidates: ruleFiltered,
    userEmbedding,
    // Match the full pipeline's ceiling (maxDigestSize = DIGEST_EMAIL_MAX_CARDS)
    // instead of a hard-coded 5, so a degraded week can produce a real 5–15-lead
    // digest rather than being silently capped at exactly the quiet-week floor.
    topK: DIGEST_EMAIL_MAX_CARDS,
  });

  const results = vectorRanked.map((c, i) => ({
    daId: c.daId,
    // Synthetic descending rank score. Cosine order already fixes the ranking
    // (assemble ranks by array position), so this only drives the relevance
    // pip — floor it at DIGEST_MIN_RERANK_SCORE so the degraded path never
    // writes a relevance_score < 4 either (issue #163 criterion: no
    // sub-threshold score is EVER persisted, including this cost-cap path).
    score: Math.max(DIGEST_MIN_RERANK_SCORE, 5 - i),
    why: "Matches your roofing query",
    confidence: 0,
    modelUsed: "embedding-only",
    candidate: c,
  }));

  const stats = {
    ruleFiltered: ruleFiltered.length,
    vectorRanked: vectorRanked.length,
    rerankInput: 0,
    rerankSurfaced: vectorRanked.length,
  };

  // FR-006 quiet-week gate (issue #201): the degraded path must honour the same
  // 5-lead floor as the full pipeline (run above at the main-path return). A
  // cost-cap or Anthropic-outage week with only 1–4 cosine matches is a quiet
  // week — surface nothing so assemble sends the FR-010 reassurance email
  // ("we checked N DAs, nothing strong") instead of a thin sub-floor digest
  // whose leads never cleared any relevance bar. `stats.ruleFiltered` is kept
  // so that email can still report how many DAs were actually checked.
  if (results.length > 0 && results.length < DIGEST_EMAIL_MIN_CARDS) {
    log.info(
      { userId, cleared: results.length, floor: DIGEST_EMAIL_MIN_CARDS, reason },
      "[relevance] quiet week (embedding-only) — fewer than the minimum leads matched",
    );
    return { results: [], stats, fallbackUsed: true, fallbackReason: reason };
  }

  return {
    results,
    stats,
    fallbackUsed: true,
    fallbackReason: reason,
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
