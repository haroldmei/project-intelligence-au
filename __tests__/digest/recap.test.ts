// Weekly rated-lead recap stat (CF-1.7, issue #51; relabelled #186).
// computeRatedLeadRecap turns a user's trailing-4-week thumbs into their own
// on-target rate (N marked 👍 of M rated) — NOT ground-truth precision.
// countSentDigests backs the "from week 4" gate. Fully mocked DB — no network.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    daFeedback: { findMany: vi.fn() },
    digest: { count: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));

import {
  computeRatedLeadRecap,
  countSentDigests,
  RECAP_WINDOW_WEEKS,
} from "@/modules/digest/recap";

const NOW = new Date("2026-04-27T08:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeRatedLeadRecap (CF-1.7, #186)", () => {
  it("reports N-of-M and the rounded on-target rate from thumbs", async () => {
    mockDb.daFeedback.findMany.mockResolvedValue([
      { feedback: "up" },
      { feedback: "up" },
      { feedback: "down" },
    ]);
    const recap = await computeRatedLeadRecap("user-1", NOW);
    expect(recap).toEqual({
      onTarget: 2,
      rated: 3,
      rate: 67,
      weeks: RECAP_WINDOW_WEEKS,
    });
  });

  it("reports 100 when every rated lead was thumbed up", async () => {
    mockDb.daFeedback.findMany.mockResolvedValue([
      { feedback: "up" },
      { feedback: "up" },
    ]);
    const recap = await computeRatedLeadRecap("user-1", NOW);
    expect(recap).toEqual({ onTarget: 2, rated: 2, rate: 100, weeks: RECAP_WINDOW_WEEKS });
  });

  it("returns null when the user has rated nothing in the window", async () => {
    mockDb.daFeedback.findMany.mockResolvedValue([]);
    const recap = await computeRatedLeadRecap("user-1", NOW);
    expect(recap).toBeNull();
  });

  it("queries only feedback from the trailing 4-week window", async () => {
    mockDb.daFeedback.findMany.mockResolvedValue([{ feedback: "up" }]);
    await computeRatedLeadRecap("user-1", NOW);

    const where = mockDb.daFeedback.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe("user-1");
    const expectedSince = new Date(
      NOW.getTime() - RECAP_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000,
    );
    expect(where.createdAt.gte.getTime()).toBe(expectedSince.getTime());
  });

  it("ignores unexpected feedback values in the denominator", async () => {
    mockDb.daFeedback.findMany.mockResolvedValue([
      { feedback: "up" },
      { feedback: "down" },
      { feedback: "bogus" },
    ]);
    const recap = await computeRatedLeadRecap("user-1", NOW);
    // 1 up / 2 rated (up+down) = 50%; the bogus row is not counted.
    expect(recap).toEqual({ onTarget: 1, rated: 2, rate: 50, weeks: RECAP_WINDOW_WEEKS });
  });
});

describe("countSentDigests", () => {
  it("counts sent digests, excluding the in-flight one", async () => {
    mockDb.digest.count.mockResolvedValue(3);
    const n = await countSentDigests("user-1", "digest-current");
    expect(n).toBe(3);

    const where = mockDb.digest.count.mock.calls[0][0].where;
    expect(where.userId).toBe("user-1");
    expect(where.sentAt).toEqual({ not: null });
    expect(where.NOT).toEqual({ id: "digest-current" });
  });

  it("omits the exclusion clause when no digest id is given", async () => {
    mockDb.digest.count.mockResolvedValue(5);
    await countSentDigests("user-1");
    const where = mockDb.digest.count.mock.calls[0][0].where;
    expect(where.NOT).toBeUndefined();
  });
});
