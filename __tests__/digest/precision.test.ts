// Weekly precision recap stat (CF-1.7, issue #51). computePrecisionRecap turns
// a user's trailing-4-week thumbs into the TP/(TP+FP) proof stat; countSentDigests
// backs the "from week 4" gate. Fully mocked DB — no network, no Prisma.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    daFeedback: { findMany: vi.fn() },
    digest: { count: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));

import {
  computePrecisionRecap,
  countSentDigests,
  PRECISION_WINDOW_WEEKS,
} from "@/modules/digest/precision";

const NOW = new Date("2026-04-27T08:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computePrecisionRecap (CF-1.7)", () => {
  it("computes TP/(TP+FP) as a rounded percentage from thumbs", async () => {
    mockDb.daFeedback.findMany.mockResolvedValue([
      { feedback: "up" },
      { feedback: "up" },
      { feedback: "down" },
    ]);
    const recap = await computePrecisionRecap("user-1", NOW);
    expect(recap).toEqual({ precision: 67, weeks: PRECISION_WINDOW_WEEKS });
  });

  it("returns 100 when every rated lead was thumbed up", async () => {
    mockDb.daFeedback.findMany.mockResolvedValue([
      { feedback: "up" },
      { feedback: "up" },
    ]);
    const recap = await computePrecisionRecap("user-1", NOW);
    expect(recap?.precision).toBe(100);
  });

  it("returns null when the user has rated nothing in the window", async () => {
    mockDb.daFeedback.findMany.mockResolvedValue([]);
    const recap = await computePrecisionRecap("user-1", NOW);
    expect(recap).toBeNull();
  });

  it("queries only feedback from the trailing 4-week window", async () => {
    mockDb.daFeedback.findMany.mockResolvedValue([{ feedback: "up" }]);
    await computePrecisionRecap("user-1", NOW);

    const where = mockDb.daFeedback.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe("user-1");
    const expectedSince = new Date(
      NOW.getTime() - PRECISION_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000,
    );
    expect(where.createdAt.gte.getTime()).toBe(expectedSince.getTime());
  });

  it("ignores unexpected feedback values in the denominator", async () => {
    mockDb.daFeedback.findMany.mockResolvedValue([
      { feedback: "up" },
      { feedback: "down" },
      { feedback: "bogus" },
    ]);
    const recap = await computePrecisionRecap("user-1", NOW);
    // 1 up / 2 rated (up+down) = 50%; the bogus row is not counted.
    expect(recap?.precision).toBe(50);
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
