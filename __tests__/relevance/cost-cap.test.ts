// Unit tests for cost-cap kill switch logic (dev-plan §A.5)
// Tests the weekly cost ceiling enforcement in relevance/run.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/cost-ledger", () => ({
  weeklyCostAud: vi.fn(),
  weekStartAEST: vi.fn().mockReturnValue(new Date("2026-04-28T00:00:00Z")),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/modules/relevance/filters", () => ({
  ruleFilter: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/modules/relevance/vector", () => ({
  vectorRank: vi.fn().mockResolvedValue([]),
}));

import { weeklyCostAud } from "@/lib/ai/cost-ledger";
import { db } from "@/lib/db";

describe("cost-cap kill switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when user not found", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { runRelevanceForUser } = await import("@/modules/relevance/run");
    const result = await runRelevanceForUser("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when user has no saved query", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      savedQueryText: null,
      savedQueryEmbedding: null,
      lgaBundles: [],
    });
    const { runRelevanceForUser } = await import("@/modules/relevance/run");
    const result = await runRelevanceForUser("u1");
    expect(result).toBeNull();
  });

  it("sets fallbackUsed=true when cost cap breached", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      savedQueryText: "roofing",
      savedQueryEmbedding: Array(1536).fill(0),
      lgaBundles: [{ bundle: { lgas: [{ id: "blacktown" }] } }],
    });
    (weeklyCostAud as ReturnType<typeof vi.fn>).mockResolvedValue(0.20); // > 0.13

    const { runRelevanceForUser } = await import("@/modules/relevance/run");
    const result = await runRelevanceForUser("u1");

    expect(result?.fallbackUsed).toBe(true);
  });
});
