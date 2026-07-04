// Concurrent-overlap guard for the DigestRun (issue #93). Two overlapping
// invocations of runDigestCron for the same week must NOT each create their own
// DigestRun — otherwise they run under different runIds and the per-(user,run)
// Digest unique can never dedupe them, so every subscriber is emailed twice.
//
// The week_key column is UNIQUE, so both invocations compute the identical key;
// only one create wins and the loser catches P2002 and adopts the winner's run,
// re-processing only users the winner hasn't served yet.
//
// Fully mocked (no DB): digestRun.create is made to throw P2002 to simulate the
// loser, and findFirstOrThrow returns the winner's run.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, relevanceMock, assembleMock, sentryMock } = vi.hoisted(() => ({
  mockDb: {
    digestRun: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    digest: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn() },
  },
  relevanceMock: vi.fn(),
  assembleMock: vi.fn(),
  sentryMock: { captureMessage: vi.fn(), captureException: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/modules/relevance/run", () => ({ runRelevanceForUser: relevanceMock }));
vi.mock("@/modules/digest/assemble", () => ({ assembleAndSendDigest: assembleMock }));
vi.mock("@sentry/nextjs", () => sentryMock);

import { runDigestCron } from "@/modules/digest/cron";

const RELEVANCE = { fallbackUsed: false, results: [] };

function users(...ids: string[]) {
  return ids.map((id) => ({ id, email: `${id}@example.com` }));
}
function delivered(userId: string) {
  return { userId, emailStatus: "sent", smsStatus: "sent" };
}
function p2002() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

beforeEach(() => {
  vi.clearAllMocks();
  relevanceMock.mockResolvedValue(RELEVANCE);
  assembleMock.mockResolvedValue({ digestId: "d", daCount: 0, emailStatus: "sent", smsStatus: "sent" });
  mockDb.digestRun.update.mockResolvedValue({});
  mockDb.digest.create.mockResolvedValue({ id: "audit" });
  mockDb.digest.update.mockResolvedValue({});
  mockDb.digest.findFirst.mockResolvedValue(null);
});

describe("runDigestCron — concurrent DigestRun creation (issue #93)", () => {
  it("loser of the create race adopts the winner's run instead of creating a second", async () => {
    // Both invocations miss the week-key lookup (fresh week)...
    mockDb.digestRun.findFirst.mockResolvedValue(null);
    // ...this one loses the unique create...
    mockDb.digestRun.create.mockRejectedValue(p2002());
    // ...and adopts the winner's run.
    mockDb.digestRun.findFirstOrThrow.mockResolvedValue({ id: "run-1", status: "running" });
    mockDb.user.findMany.mockResolvedValue(users("u1", "u2"));
    mockDb.digest.findMany
      // resume filter: winner already served u1; only u2 is pending here.
      .mockResolvedValueOnce([delivered("u1")])
      .mockResolvedValueOnce([delivered("u1"), delivered("u2")]);

    const result = await runDigestCron();

    // Did NOT create a second run — adopted run-1 via findFirstOrThrow.
    expect(mockDb.digestRun.create).toHaveBeenCalledTimes(1); // threw
    expect(mockDb.digestRun.findFirstOrThrow).toHaveBeenCalledTimes(1);
    expect(result.runId).toBe("run-1");
    expect(result.resumed).toBe(true);
    // Only the unserved u2 is processed — u1 (served by the winner) is skipped.
    const processed = assembleMock.mock.calls.map((c) => c[0]);
    expect(processed).toEqual(["u2"]);
    expect(result.unserved).toBe(0);
  });

  it("re-throws a non-P2002 create error", async () => {
    mockDb.digestRun.findFirst.mockResolvedValue(null);
    mockDb.digestRun.create.mockRejectedValue(new Error("connection reset"));
    mockDb.user.findMany.mockResolvedValue(users("u1"));

    await expect(runDigestCron()).rejects.toThrow("connection reset");
    expect(mockDb.digestRun.findFirstOrThrow).not.toHaveBeenCalled();
  });
});
