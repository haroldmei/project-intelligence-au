// Issue #11: the thumbs feedback moat only activates once a user has enough
// labels. This locks the activation boundary (MIN_FEEDBACK_FOR_PERSONALISATION,
// lowered 200 → 25) AND proves the end-to-end contract the moat depends on:
// past thumbs are injected into the rerank prompt at ≥ 25 labels, and NOT before.
//
// Fully mocked DB — daFeedback.count drives the gate.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    daFeedback: { count: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));

import { loadThumbsExamples } from "@/modules/relevance/thumbs";
import { renderUserPrompt, type RerankInput } from "@/lib/ai/rerank";

const USER_ID = "user-1";

// One up + one down row, shaped as the include selects them.
const UP_ROWS = [
  { da: { address: "1 Up St, Blacktown", description: "Colorbond reroof of dwelling" } },
];
const DOWN_ROWS = [
  { da: { address: "9 Down Rd, Penrith", description: "New two-storey dwelling, no roof scope" } },
];

function primeFindMany() {
  // loadThumbsExamples calls findMany twice: first the "up" side, then "down".
  mockDb.daFeedback.findMany
    .mockResolvedValueOnce(UP_ROWS)
    .mockResolvedValueOnce(DOWN_ROWS);
}

const RERANK_INPUT: Omit<RerankInput, "thumbsExamples"> = {
  userId: USER_ID,
  savedQueryText: "metal reroof, colorbond, gutter replacement",
  savedQueryEmbedding: [],
  userLgaSlugs: ["blacktown"],
  candidates: [
    {
      daId: "da-1",
      council: "Blacktown",
      address: "1 Test St, Blacktown",
      description: "Reroof of existing dwelling with Colorbond.",
      rawScopeText: null,
      estimatedValue: 500000,
      lodgementDate: "2026-06-01",
      constructionCertifiedAt: null,
    },
  ],
};

const PERSONALISATION_HEADING = "# Personalisation — recent thumbs";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadThumbsExamples — personalisation activation threshold (issue #11)", () => {
  it("returns no examples just below the threshold (24 thumbs)", async () => {
    mockDb.daFeedback.count.mockResolvedValue(24);
    const examples = await loadThumbsExamples({ userId: USER_ID });
    expect(examples).toEqual([]);
    // Gate short-circuits before any row fetch.
    expect(mockDb.daFeedback.findMany).not.toHaveBeenCalled();
  });

  it("returns examples exactly at the threshold (25 thumbs)", async () => {
    mockDb.daFeedback.count.mockResolvedValue(25);
    primeFindMany();
    const examples = await loadThumbsExamples({ userId: USER_ID });
    expect(examples).toEqual([
      { daText: "1 Up St, Blacktown: Colorbond reroof of dwelling", feedback: "up" },
      { daText: "9 Down Rd, Penrith: New two-storey dwelling, no roof scope", feedback: "down" },
    ]);
  });
});

describe("rerank prompt injection follows the threshold (issue #11)", () => {
  it("omits the personalisation block below the threshold", async () => {
    mockDb.daFeedback.count.mockResolvedValue(24);
    const thumbsExamples = await loadThumbsExamples({ userId: USER_ID });
    const prompt = renderUserPrompt({ ...RERANK_INPUT, thumbsExamples });
    expect(prompt).not.toContain(PERSONALISATION_HEADING);
    expect(prompt).not.toContain("<thumb>");
  });

  it("injects the personalisation block at/above the threshold", async () => {
    mockDb.daFeedback.count.mockResolvedValue(25);
    primeFindMany();
    const thumbsExamples = await loadThumbsExamples({ userId: USER_ID });
    const prompt = renderUserPrompt({ ...RERANK_INPUT, thumbsExamples });
    expect(prompt).toContain(PERSONALISATION_HEADING);
    expect(prompt).toContain("[up] <thumb>1 Up St, Blacktown: Colorbond reroof of dwelling</thumb>");
    expect(prompt).toContain("[down] <thumb>9 Down Rd, Penrith: New two-storey dwelling, no roof scope</thumb>");
  });
});
