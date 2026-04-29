// AI cost ledger — typed wrapper over Prisma AiCostLog.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2 | Phase: ai-features
//
// Used by every AI call (embeddings + rerank). Ceiling: AUD 0.50/user/month
// on AI inference (contract.ai.cost_tracking_impl). Weekly equivalent
// AUD 0.13 triggers a Sentry alert (FR-006).
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export type AiCostPhase = "embedding" | "rerank";

export interface AiCostInput {
  userId: string;
  phase: AiCostPhase;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * AUD cost. Callers compute via `priceFor(model, inputTokens, outputTokens)`
   * so that ledger row stores the canonical figure (not provider's USD).
   */
  costAud: number;
  /**
   * The Monday 00:00 AEST that anchors this digest week. Aggregations
   * group by `(userId, weekStart)` to enforce the AUD 0.13/week ceiling.
   */
  weekStart: Date;
}

/**
 * USD → AUD reference rate. Used only for cost translation in the ledger.
 * Override at deploy via env if FX drift > 5%; default 1 USD ≈ 1.52 AUD
 * (2026-Q2 anchor; quarterly review per stack contract).
 */
const USD_TO_AUD = env.USD_TO_AUD;

/**
 * Per-1M-token rates in USD, pinned to the contract's model IDs.
 * Sources are provider published rates as of 2026-Q2.
 */
const RATES_USD_PER_M: Record<
  string,
  { input: number; output: number }
> = {
  // Anthropic claude family
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  // OpenAI embeddings (output tokens always 0)
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

/**
 * Cost in AUD for a given model + token counts. Returns 0 if model unknown
 * (and logs a warning — caller should still ledger the call so we see it).
 */
export function priceFor(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = RATES_USD_PER_M[model];
  if (!rate) {
    console.warn(
      `[cost-ledger] unknown model=${model}; logging at cost=0; add to RATES_USD_PER_M`,
    );
    return 0;
  }
  const usd =
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output;
  return Number((usd * USD_TO_AUD).toFixed(6));
}

/**
 * Anchor a Date to the Monday 00:00 of its AEST week. Used as the
 * `weekStart` partition key for cost aggregation.
 *
 * AEST is UTC+10 (Sydney does not observe DST in winter; AEDT in summer
 * shifts to UTC+11). For ledger anchoring we use a fixed UTC+10 offset —
 * the digest cron fires Sunday 17:00 AEST and the week boundary moves
 * by ≤ 1 hour at DST transitions, which has no effect on weekly aggregation.
 */
export function weekStartAEST(d: Date = new Date()): Date {
  const utcMs = d.getTime();
  const aestMs = utcMs + 10 * 60 * 60 * 1000;
  const aest = new Date(aestMs);
  // JS getUTCDay: 0=Sun, 1=Mon, ... — back up to Monday
  const dow = aest.getUTCDay();
  const daysFromMonday = (dow + 6) % 7;
  const mondayAest = new Date(aest);
  mondayAest.setUTCDate(aest.getUTCDate() - daysFromMonday);
  mondayAest.setUTCHours(0, 0, 0, 0);
  // Convert back to UTC date for storage
  return new Date(mondayAest.getTime() - 10 * 60 * 60 * 1000);
}

/**
 * Insert one row in `ai_cost_log`. Never throws — cost tracking failure
 * must not bring down the digest cron (degrades to "we lost a row" not
 * "user gets no email").
 */
export async function recordAiCost(input: AiCostInput): Promise<void> {
  try {
    await db.aiCostLog.create({
      data: {
        userId: input.userId,
        phase: input.phase,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costAud: input.costAud,
        weekStart: input.weekStart,
      },
    });
  } catch (err) {
    // Don't throw — log and move on. Sentry will catch via global handler.
    console.error("[cost-ledger] failed to write ai_cost_log row", {
      err,
      userId: input.userId,
      phase: input.phase,
      model: input.model,
    });
  }
}

/**
 * Sum AUD cost for a user in a given week. Used by the kill-switch to
 * decide whether the next digest run for this user must degrade to
 * keyword-only ranking (per cost-cap policy in dev plan).
 */
export async function weeklyCostAud(
  userId: string,
  weekStart: Date,
): Promise<number> {
  const rows = await db.aiCostLog.findMany({
    where: { userId, weekStart },
    select: { costAud: true },
  });
  return rows.reduce((sum, r) => sum + Number(r.costAud), 0);
}
