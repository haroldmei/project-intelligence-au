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

// The embedding-only path re-runs these; return a real candidate so daCount > 0.
const CANDIDATE = {
  daId: "da-1",
  council: "inner-west",
  address: "1 Roof St",
  description: "Re-roof, tile to Colorbond",
  rawScopeText: null,
  estimatedValue: 40000,
  lodgementDate: "2026-04-20",
  applicantName: "Acme",
  portalUrl: "https://council.nsw.gov.au/da/da-1",
  constructionCertifiedAt: null,
  approvalPathway: "cdc",
  cosineSimilarity: 0.9,
};
vi.mock("@/modules/relevance/filters", () => ({
  ruleFilter: vi.fn().mockResolvedValue([CANDIDATE]),
}));
vi.mock("@/modules/relevance/vector", () => ({
  vectorRank: vi.fn().mockResolvedValue([CANDIDATE]),
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
      // Embedding-only produced at least one ranked lead — not an empty/failed run.
      expect(result!.results.length).toBeGreaterThan(0);
      // Degraded rows carry the spec's placeholder + are attributed to embedding-only.
      expect(result!.results[0].modelUsed).toBe("embedding-only");
      expect(result!.results[0].why).toBe("Matches your roofing query");
    });
  }

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
