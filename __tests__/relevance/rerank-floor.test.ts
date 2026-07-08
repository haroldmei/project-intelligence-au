// FR-006 relevance floor at the rerank layer (issue #163).
//
// The rerank is Stage 3 of the relevance pipeline and the ONLY stage that scores
// relevance. FR-006 requires the digest to contain DAs with relevance_score ≥ 4
// (0–10 scale). rerank scores on a 0–5 rubric that assemble.ts doubles to 0–10,
// so the floor on the rubric is DIGEST_MIN_RERANK_SCORE = 2 (2 × 2 = 4).
//
// Production used to run this floor at 0 (relevance-pipeline defaulted
// minScoreForDigest to 0), so DAs the model scored 0/10 shipped as "leads".
// These tests pin the rerank filter to the shared floor constant.
//
// Fully mocked: the cost ledger (would hit Postgres) is stubbed and a fake
// Anthropic client is injected, so no DB and no network.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

vi.mock("@/lib/ai/cost-ledger", () => ({
  priceFor: () => 0,
  recordAiCost: vi.fn(async () => {}),
  weekStartAEST: () => new Date(0),
}));

import {
  rerankCandidates,
  DIGEST_MIN_RERANK_SCORE,
  type RerankCandidate,
  type RerankInput,
} from "@/lib/ai/rerank";

function makeCandidate(daId: string): RerankCandidate {
  return {
    daId,
    council: "blacktown",
    address: `${daId} Test St`,
    description: "Re-roof of existing dwelling with Colorbond",
    rawScopeText: null,
    estimatedValue: 120_000,
    lodgementDate: "2026-04-01",
    constructionCertifiedAt: null,
    approvalPathway: "da",
  };
}

function makeInput(candidates: RerankCandidate[]): RerankInput {
  return {
    userId: "u1",
    savedQueryText: "metal re-roofing",
    savedQueryEmbedding: Array(1536).fill(0),
    userLgaSlugs: ["blacktown"],
    candidates,
  };
}

/** Fake Anthropic client that returns one canned JSON body, high confidence so
 *  the sonnet fallback escalation never fires (single deterministic call). */
function makeClient(scoreByDaId: Record<string, number>): Anthropic {
  const results = Object.entries(scoreByDaId).map(([da_id, score]) => ({
    da_id,
    score,
    why: "re-roof",
    confidence: 0.9,
  }));
  const create = vi.fn(async () => ({
    content: [{ type: "text", text: JSON.stringify({ results }) }],
    usage: { input_tokens: 10, output_tokens: 10 },
  }));
  return { messages: { create } } as unknown as Anthropic;
}

beforeEach(() => vi.clearAllMocks());

describe("rerankCandidates — FR-006 relevance floor (issue #163)", () => {
  it("the shared floor is rubric 2, i.e. relevance_score 4 on the 0–10 scale", () => {
    expect(DIGEST_MIN_RERANK_SCORE).toBe(2);
    expect(DIGEST_MIN_RERANK_SCORE * 2).toBe(4);
  });

  it("drops every DA scored below the floor by default (0 and 1 never survive)", async () => {
    const candidates = ["da-5", "da-4", "da-2", "da-1", "da-0"].map(makeCandidate);
    const client = makeClient({
      "da-5": 5,
      "da-4": 4,
      "da-2": 2, // exactly the floor — must survive
      "da-1": 1, // below floor — must be dropped
      "da-0": 0, // the bug's poster child — must be dropped
    });

    const out = await rerankCandidates(makeInput(candidates), { client });

    const ids = out.map((r) => r.daId).sort();
    expect(ids).toEqual(["da-2", "da-4", "da-5"]);
    // Nothing below the floor survives → nothing that would map to relevance_score < 4.
    expect(out.every((r) => r.score >= DIGEST_MIN_RERANK_SCORE)).toBe(true);
    expect(out.every((r) => r.score * 2 >= 4)).toBe(true);
    expect(out.find((r) => r.daId === "da-0")).toBeUndefined();
    expect(out.find((r) => r.daId === "da-1")).toBeUndefined();
  });

  it("a caller can still tighten the floor, but never loosen it below the rubric", async () => {
    const candidates = ["da-5", "da-3", "da-2"].map(makeCandidate);
    const client = makeClient({ "da-5": 5, "da-3": 3, "da-2": 2 });

    const strict = await rerankCandidates(makeInput(candidates), { client, minScore: 4 });
    expect(strict.map((r) => r.daId).sort()).toEqual(["da-5"]);
  });
});
