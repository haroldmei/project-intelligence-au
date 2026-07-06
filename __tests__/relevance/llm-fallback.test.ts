// Embedding-only fallback on Claude rerank outage (system-design §7.3, issue #181).
//
// When the Anthropic rerank is unavailable (429/5xx/timeout) the Sunday digest
// must DEGRADE to embedding-only ranking — the user still gets leads — instead
// of throwing out of the pipeline and leaving the cron to record a "failed"
// audit row with no email (NFR-019 ≥99% delivery SLA). A non-transient error
// (bad key, malformed request) or a DB failure must still propagate as a hard
// failure so a broken deploy pages rather than silently shipping basic mode.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  APIConnectionTimeoutError,
  RateLimitError,
  InternalServerError,
  AuthenticationError,
} from "@anthropic-ai/sdk";
import { DIGEST_EMAIL_MIN_CARDS } from "@/modules/digest/constants";

vi.mock("@/lib/ai/cost-ledger", () => ({
  weeklyCostAud: vi.fn().mockResolvedValue(0), // under the cost cap
  weekStartAEST: vi.fn().mockReturnValue(new Date("2026-04-28T00:00:00Z")),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    digestDa: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([
      { saved_query_embedding: `[${Array(1536).fill(0).join(",")}]` },
    ]),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

// The embedding-only path re-runs these. Return DIGEST_EMAIL_MIN_CARDS matches so
// the degraded path clears the FR-006 quiet-week floor (issue #201) and surfaces
// a real digest — a single card would (correctly) be gated to a quiet week, which
// is exercised separately below.
function candidate(i: number) {
  return {
    daId: `da-${i}`,
    council: "inner-west",
    address: `${i} Roof St`,
    description: "Re-roof, tile to Colorbond",
    rawScopeText: null,
    estimatedValue: 40000,
    lodgementDate: "2026-04-20",
    applicantName: "Acme",
    portalUrl: `https://council.nsw.gov.au/da/da-${i}`,
    constructionCertifiedAt: null,
    approvalPathway: "cdc",
    cosineSimilarity: 0.9,
  };
}
const CANDIDATES = Array.from({ length: DIGEST_EMAIL_MIN_CARDS }, (_, i) => candidate(i + 1));
const ruleFilterMock = vi.fn().mockResolvedValue(CANDIDATES);
const vectorRankMock = vi.fn().mockResolvedValue(CANDIDATES);
vi.mock("@/modules/relevance/filters", () => ({
  ruleFilter: (...args: unknown[]) => ruleFilterMock(...args),
}));
vi.mock("@/modules/relevance/vector", () => ({
  vectorRank: (...args: unknown[]) => vectorRankMock(...args),
}));
vi.mock("@/modules/relevance/thumbs", () => ({
  loadThumbsExamples: vi.fn().mockResolvedValue([]),
}));

// The unit under test drives run.ts's catch. Mock the pipeline so we control
// exactly what it throws (a real Anthropic error instance, so the classifier is
// exercised against the actual SDK classes).
vi.mock("@/lib/ai/relevance-pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/relevance-pipeline")>();
  return { ...actual, runRelevancePipeline: vi.fn() };
});

import { db } from "@/lib/db";
import { runRelevancePipeline } from "@/lib/ai/relevance-pipeline";

const USER = {
  id: "u1",
  savedQueryText: "roofing",
  savedQueryEmbedding: Array(1536).fill(0),
  lgaBundles: [{ bundle: { lgas: [{ id: "inner-west" }] } }],
};

describe("relevance run — LLM-unavailable fallback (§7.3, issue #181)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    ruleFilterMock.mockResolvedValue(CANDIDATES);
    vectorRankMock.mockResolvedValue(CANDIDATES);
  });

  const outages: Array<[string, unknown]> = [
    ["timeout", new APIConnectionTimeoutError()],
    ["429 rate limit", new RateLimitError(429, undefined, "slow down", new Headers(), null)],
    ["529 overloaded", new InternalServerError(529, undefined, "overloaded", new Headers(), null)],
  ];

  for (const [label, err] of outages) {
    it(`degrades to embedding-only on ${label} (fallbackUsed + daCount>0, no throw)`, async () => {
      (runRelevancePipeline as ReturnType<typeof vi.fn>).mockRejectedValue(err);

      const { runRelevanceForUser } = await import("@/modules/relevance/run");
      const result = await runRelevanceForUser("u1");

      expect(result).not.toBeNull();
      expect(result?.fallbackUsed).toBe(true);
      expect(result?.fallbackReason).toBe("llm_unavailable");
      // Enough cosine matches cleared the quiet-week floor → a real degraded digest.
      expect(result!.results.length).toBeGreaterThanOrEqual(DIGEST_EMAIL_MIN_CARDS);
      // Degraded rows carry the spec's placeholder + are attributed to embedding-only.
      expect(result!.results[0].modelUsed).toBe("embedding-only");
      expect(result!.results[0].why).toBe("Matches your roofing query");
    });
  }

  it.each([1, DIGEST_EMAIL_MIN_CARDS - 1])(
    "sends a quiet week (no cards) when the outage leaves only %i cosine matches — never a thin sub-floor digest (issue #201)",
    async (n) => {
      (runRelevancePipeline as ReturnType<typeof vi.fn>).mockRejectedValue(
        new RateLimitError(429, undefined, "slow down", new Headers(), null),
      );
      const thin = Array.from({ length: n }, (_, i) => candidate(i + 1));
      ruleFilterMock.mockResolvedValue(thin);
      vectorRankMock.mockResolvedValue(thin);

      const { runRelevanceForUser } = await import("@/modules/relevance/run");
      const result = await runRelevanceForUser("u1");

      // Degraded, but held to the FR-006 floor → surface nothing (FR-010 email).
      expect(result?.fallbackUsed).toBe(true);
      expect(result?.fallbackReason).toBe("llm_unavailable");
      expect(result?.results).toEqual([]);
      // …while still reporting how many DAs were actually checked.
      expect(result?.stats.ruleFiltered).toBe(n);
    },
  );

  it("propagates a non-transient Anthropic error (401) — no silent basic-mode masking", async () => {
    (runRelevancePipeline as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AuthenticationError(401, undefined, "invalid api key", new Headers(), null),
    );
    const { runRelevanceForUser } = await import("@/modules/relevance/run");
    await expect(runRelevanceForUser("u1")).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("propagates a non-Anthropic error (e.g. a DB failure) as a hard failure", async () => {
    (runRelevancePipeline as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("connection terminated unexpectedly"),
    );
    const { runRelevanceForUser } = await import("@/modules/relevance/run");
    await expect(runRelevanceForUser("u1")).rejects.toThrow("connection terminated");
  });
});
