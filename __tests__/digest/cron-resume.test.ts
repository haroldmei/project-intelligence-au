// Idempotent resume + retry semantics for the Sunday digest cron (issue #12).
// docs/01c-wedge declares the digest "the highest-availability code path — it
// must fail loud and re-fire". A failed primary tick (Sun 07:00 UTC) is
// recovered by a retry tick (Sun 10:00 UTC) that re-invokes the SAME handler;
// runDigestCron() must resume the week's run and touch ONLY the users the
// primary left unserved — never double-processing a delivered user.
//
// Fully mocked (no DB): the mocks stand in for the run/digest rows so we can
// assert exactly which users each invocation processes.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, relevanceMock, assembleMock, sentryMock } = vi.hoisted(() => ({
  mockDb: {
    digestRun: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
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

import { runDigestCron, isDigestComplete } from "@/modules/digest/cron";

// A non-null relevance result is enough — assembleAndSendDigest is mocked.
const RELEVANCE = { fallbackUsed: false, results: [] };

function users(...ids: string[]) {
  return ids.map((id) => ({ id, email: `${id}@example.com` }));
}
/** Digest rows as returned by db.digest.findMany(select userId/email/sms). */
function delivered(userId: string) {
  return { userId, emailStatus: "sent", smsStatus: "sent" };
}

beforeEach(() => {
  vi.clearAllMocks();
  relevanceMock.mockResolvedValue(RELEVANCE);
  assembleMock.mockResolvedValue({ digestId: "d", daCount: 0, emailStatus: "sent", smsStatus: "sent" });
  mockDb.digestRun.create.mockResolvedValue({ id: "run-1", status: "running" });
  mockDb.digestRun.update.mockResolvedValue({});
  mockDb.digest.create.mockResolvedValue({ id: "audit" });
  mockDb.digest.update.mockResolvedValue({});
  mockDb.digest.findFirst.mockResolvedValue(null);
});

describe("isDigestComplete", () => {
  it("is complete only when both channels are terminal", () => {
    expect(isDigestComplete({ emailStatus: "sent", smsStatus: "sent" })).toBe(true);
    expect(isDigestComplete({ emailStatus: "sent", smsStatus: "skipped" })).toBe(true);
    expect(isDigestComplete({ emailStatus: "skipped_optout", smsStatus: null })).toBe(true);
    expect(isDigestComplete({ emailStatus: "skipped", smsStatus: null })).toBe(true);
    // Retryable states:
    expect(isDigestComplete({ emailStatus: "failed", smsStatus: "sent" })).toBe(false);
    expect(isDigestComplete({ emailStatus: "sent", smsStatus: "failed" })).toBe(false);
    expect(isDigestComplete({ emailStatus: "pending", smsStatus: null })).toBe(false);
    expect(isDigestComplete({ emailStatus: null, smsStatus: null })).toBe(false);
  });
});

describe("runDigestCron — primary tick (fresh run)", () => {
  it("creates a run and processes every active user", async () => {
    mockDb.digestRun.findFirst.mockResolvedValue(null); // no run this week yet
    mockDb.user.findMany.mockResolvedValue(users("u1", "u2"));
    mockDb.digest.findMany
      .mockResolvedValueOnce([]) // resume filter: nothing delivered yet
      .mockResolvedValueOnce([delivered("u1"), delivered("u2")]); // final recount

    const result = await runDigestCron();

    expect(mockDb.digestRun.create).toHaveBeenCalledTimes(1);
    expect(result.resumed).toBe(false);
    expect(assembleMock).toHaveBeenCalledTimes(2);
    expect(result.unserved).toBe(0);
    expect(sentryMock.captureMessage).not.toHaveBeenCalled();
  });
});

describe("runDigestCron — retry tick (resume)", () => {
  it("processes ONLY the users the primary left unserved", async () => {
    mockDb.digestRun.findFirst.mockResolvedValue({ id: "run-1", status: "done" }); // exists
    mockDb.user.findMany.mockResolvedValue(users("u1", "u2", "u3"));
    mockDb.digest.findMany
      // resume filter: u1 fully delivered; u2 email failed; u3 has no row.
      .mockResolvedValueOnce([
        delivered("u1"),
        { userId: "u2", emailStatus: "failed", smsStatus: null },
      ])
      // final recount: everyone now delivered.
      .mockResolvedValueOnce([delivered("u1"), delivered("u2"), delivered("u3")]);

    const result = await runDigestCron();

    expect(mockDb.digestRun.create).not.toHaveBeenCalled(); // reused, not created
    expect(mockDb.digestRun.update).toHaveBeenCalled(); // reopened + finalised
    expect(result.resumed).toBe(true);
    // Only u2 (failed) and u3 (never attempted) — NOT the delivered u1.
    expect(assembleMock).toHaveBeenCalledTimes(2);
    const processed = assembleMock.mock.calls.map((c) => c[0]);
    expect(processed).toEqual(expect.arrayContaining(["u2", "u3"]));
    expect(processed).not.toContain("u1");
  });

  it("is a NO-OP when the primary already served everyone", async () => {
    mockDb.digestRun.findFirst.mockResolvedValue({ id: "run-1", status: "done" });
    mockDb.user.findMany.mockResolvedValue(users("u1", "u2"));
    mockDb.digest.findMany
      .mockResolvedValueOnce([delivered("u1"), delivered("u2")]) // all delivered
      .mockResolvedValueOnce([delivered("u1"), delivered("u2")]);

    const result = await runDigestCron();

    expect(assembleMock).not.toHaveBeenCalled();
    expect(relevanceMock).not.toHaveBeenCalled();
    expect(result.usersProcessed).toBe(0);
    expect(result.unserved).toBe(0);
    expect(sentryMock.captureMessage).not.toHaveBeenCalled();
  });
});

describe("runDigestCron — fail loud", () => {
  it("retry pass with leftover failures emits a Sentry ERROR with the count", async () => {
    mockDb.digestRun.findFirst.mockResolvedValue({ id: "run-1", status: "failed" });
    mockDb.user.findMany.mockResolvedValue(users("u1", "u2"));
    assembleMock.mockResolvedValue({ digestId: "d", daCount: 0, emailStatus: "failed", smsStatus: "failed" });
    mockDb.digest.findMany
      .mockResolvedValueOnce([]) // both pending
      .mockResolvedValueOnce([
        { userId: "u1", emailStatus: "failed", smsStatus: null },
        { userId: "u2", emailStatus: "failed", smsStatus: null },
      ]); // still unserved after retry

    const result = await runDigestCron();

    expect(result.unserved).toBe(2);
    const errorCalls = sentryMock.captureMessage.mock.calls.filter(
      (c) => c[1]?.level === "error",
    );
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0][0]).toContain("2/2");
    expect(errorCalls[0][0]).toContain("unserved");
  });

  it("primary pass with leftover failures only WARNS (retry will recover)", async () => {
    mockDb.digestRun.findFirst.mockResolvedValue(null); // fresh — primary
    mockDb.user.findMany.mockResolvedValue(users("u1"));
    assembleMock.mockResolvedValue({ digestId: "d", daCount: 0, emailStatus: "failed", smsStatus: "failed" });
    mockDb.digest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: "u1", emailStatus: "failed", smsStatus: null }]);

    const result = await runDigestCron();

    expect(result.unserved).toBe(1);
    expect(result.resumed).toBe(false);
    const levels = sentryMock.captureMessage.mock.calls.map((c) => c[1]?.level);
    expect(levels).toContain("warning");
    expect(levels).not.toContain("error");
  });
});
