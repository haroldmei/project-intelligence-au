// FR-006 digest floor + quiet-week gate at the production wiring (issue #163).
//
// runRelevanceForUser is the per-user entrypoint the Sunday cron calls. Two
// things must hold there:
//   (a) the FR-006 relevance floor is actually passed to the pipeline — the bug
//       was that run.ts passed only maxDigestSize, so the pipeline defaulted the
//       floor to 0 and surfaced DAs the model scored 0/10;
//   (b) a "real" digest is 5–15 DAs that clear the floor. If fewer than
//       DIGEST_EMAIL_MIN_CARDS clear it, the run is a quiet week — it must
//       surface NOTHING (so assemble sends the FR-010 reassurance email) rather
//       than padding the digest with a handful of borderline leads.
//
// The pipeline itself is mocked so we can drive the exact "N cleared the floor"
// scenarios; the rerank-layer floor is proved separately in rerank-floor.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DIGEST_MIN_RERANK_SCORE } from "@/lib/ai/rerank";
import { DIGEST_EMAIL_MIN_CARDS, DIGEST_EMAIL_MAX_CARDS } from "@/modules/digest/constants";

const { runPipelineMock } = vi.hoisted(() => ({ runPipelineMock: vi.fn() }));

vi.mock("@/lib/ai/relevance-pipeline", () => ({
  runRelevancePipeline: runPipelineMock,
}));

vi.mock("@/lib/ai/cost-ledger", () => ({
  weeklyCostAud: vi.fn().mockResolvedValue(0), // under the ceiling → full pipeline path
  weekStartAEST: vi.fn().mockReturnValue(new Date("2026-04-28T00:00:00Z")),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    digestDa: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi
      .fn()
      .mockResolvedValue([{ saved_query_embedding: `[${Array(1536).fill(0).join(",")}]` }]),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

const ruleFilterMock = vi.fn().mockResolvedValue([]);
const vectorRankMock = vi.fn().mockResolvedValue([]);
vi.mock("@/modules/relevance/filters", () => ({ ruleFilter: ruleFilterMock }));
vi.mock("@/modules/relevance/vector", () => ({ vectorRank: vectorRankMock }));
vi.mock("@/modules/relevance/thumbs", () => ({
  loadThumbsExamples: vi.fn().mockResolvedValue([]),
  MIN_FEEDBACK_FOR_PERSONALISATION: 25,
}));

import { weeklyCostAud } from "@/lib/ai/cost-ledger";
import { db } from "@/lib/db";

function seedUser() {
  (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "u1",
    savedQueryText: "metal re-roofing",
    savedQueryEmbedding: Array(1536).fill(0),
    lgaBundles: [{ bundle: { lgas: [{ id: "blacktown" }] } }],
  });
}

/** A pipeline output with `n` DAs that already cleared the rerank floor. */
function pipelineOutputWith(n: number, ruleFiltered = 50) {
  return {
    results: Array.from({ length: n }, (_, i) => ({
      daId: `da-${i + 1}`,
      score: 5 - (i % 4), // all ≥ 2 — these already cleared the floor
      why: "re-roof",
      confidence: 0.9,
      modelUsed: "claude-haiku-4-5",
      candidate: { daId: `da-${i + 1}` },
    })),
    stats: { ruleFiltered, vectorRanked: n, rerankInput: n, rerankSurfaced: n },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (weeklyCostAud as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  ruleFilterMock.mockResolvedValue([]);
  vectorRankMock.mockResolvedValue([]);
  seedUser();
});

async function run() {
  const { runRelevanceForUser } = await import("@/modules/relevance/run");
  return runRelevanceForUser("u1");
}

describe("runRelevanceForUser — FR-006 floor is wired to production (issue #163)", () => {
  it("passes the relevance floor and the 5–15 ceiling to the pipeline, never 0", async () => {
    runPipelineMock.mockResolvedValue(pipelineOutputWith(8));
    await run();

    const input = runPipelineMock.mock.calls.at(-1)?.[0];
    expect(input.minScoreForDigest).toBe(DIGEST_MIN_RERANK_SCORE);
    expect(input.minScoreForDigest).not.toBe(0);
    expect(input.maxDigestSize).toBe(DIGEST_EMAIL_MAX_CARDS);
  });
});

describe("runRelevanceForUser — FR-006 quiet-week gate (issue #163)", () => {
  it("surfaces the leads when at least the minimum clear the floor", async () => {
    runPipelineMock.mockResolvedValue(pipelineOutputWith(DIGEST_EMAIL_MIN_CARDS));
    const result = await run();
    expect(result?.results).toHaveLength(DIGEST_EMAIL_MIN_CARDS);
    expect(result?.fallbackUsed).toBe(false);
  });

  it.each([1, 3, DIGEST_EMAIL_MIN_CARDS - 1])(
    "sends a quiet week (no cards) when only %i cleared the floor — no padding",
    async (n) => {
      runPipelineMock.mockResolvedValue(pipelineOutputWith(n, 137));
      const result = await run();

      // Quiet week: surface nothing so assemble sends the FR-010 reassurance email…
      expect(result?.results).toEqual([]);
      // …but keep the "we checked N DAs" count for that email.
      expect(result?.stats.ruleFiltered).toBe(137);
    },
  );

  it("stays quiet when the pipeline surfaced nothing at all", async () => {
    runPipelineMock.mockResolvedValue(pipelineOutputWith(0, 90));
    const result = await run();
    expect(result?.results).toEqual([]);
    expect(result?.stats.ruleFiltered).toBe(90);
  });
});

describe("runRelevanceForUser — embedding-only fallback respects the floor (issue #163)", () => {
  it("never emits a synthetic relevance_score below the floor", async () => {
    // Force the cost-cap kill switch → embedding-only path (no LLM rerank).
    (weeklyCostAud as ReturnType<typeof vi.fn>).mockResolvedValue(0.2); // > 0.13 ceiling
    // Five cosine matches — the last would score 5-4=1 (relevance_score 2) before
    // the floor clamp, which criterion (a) forbids from ever being written.
    const candidates = Array.from({ length: 5 }, (_, i) => ({ daId: `da-${i + 1}` }));
    ruleFilterMock.mockResolvedValue(candidates);
    vectorRankMock.mockResolvedValue(candidates);

    const result = await run();

    expect(result?.fallbackUsed).toBe(true);
    expect(result?.results).toHaveLength(5);
    expect(result?.results.every((r) => r.score >= DIGEST_MIN_RERANK_SCORE)).toBe(true);
    // …and therefore never a relevance_score (= score × 2) below 4.
    expect(result?.results.every((r) => r.score * 2 >= 4)).toBe(true);
    // Pipeline (LLM rerank) is never reached on the cost-capped path.
    expect(runPipelineMock).not.toHaveBeenCalled();
  });
});
