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
    digestDa: { count: vi.fn() },
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
import { cronWeekStartUtc } from "@/lib/cron/retry";

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
  // No cards persisted by default → the loop re-scores via runRelevanceForUser
  // (issue #196 recovery path only triggers when DigestDa rows already exist).
  mockDb.digestDa.count.mockResolvedValue(0);
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

  it("recovers from PERSISTED cards without re-scoring when the primary persisted them (issue #196)", async () => {
    // u1's primary tick persisted DigestDa cards but the email send failed. The
    // retry must re-send from those frozen cards — NOT re-run the relevance
    // pipeline, whose fresh non-deterministic score could diverge from the
    // portal (or collapse to a quiet-week email). So runRelevanceForUser is
    // skipped and assemble is invoked with relevance=null (the recovery signal).
    mockDb.digestRun.findFirst.mockResolvedValue({ id: "run-1", status: "done" });
    mockDb.user.findMany.mockResolvedValue(users("u1"));
    mockDb.digest.findMany
      .mockResolvedValueOnce([{ userId: "u1", emailStatus: "failed", smsStatus: "skipped" }])
      .mockResolvedValueOnce([delivered("u1")]);
    // Cards WERE persisted for u1 on the primary tick.
    mockDb.digestDa.count.mockResolvedValue(5);

    await runDigestCron();

    expect(relevanceMock).not.toHaveBeenCalled(); // no fresh re-score
    expect(assembleMock).toHaveBeenCalledTimes(1);
    expect(assembleMock).toHaveBeenCalledWith("u1", "run-1", null); // recovery signal
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

describe("runDigestCron — a preview run must not hijack the weekly run (issue #183)", () => {
  // An onboarding preview digest (src/modules/digest/preview.ts) creates a
  // DigestRun with NO weekKey. If a Sunday-morning signup finishes onboarding
  // inside the cron week window, that preview run sits in the DB when the
  // weekly cron fires. The cron's idempotent-resume lookup is scoped by
  // `weekKey` (issue #93), so the null-keyed preview run is invisible to it —
  // the cron creates a fresh weekly run and the preview user stays eligible for
  // their real weekly digest. This guards against a regression to the old
  // `triggeredAt >= weekStart` lookup that would have adopted the preview run.
  it("creates a NEW weekly run and keeps the preview user eligible when a preview DigestRun already exists this week", async () => {
    const weekStart = cronWeekStartUtc();

    // Preview run created earlier on Sunday (e.g. a 10:00 Sydney signup).
    // weekKey is null — the discriminator that keeps preview runs out of the
    // weekly resume lookup.
    const previewRun: { id: string; weekKey: Date | null; status: string } = {
      id: "preview-run",
      weekKey: null,
      status: "done",
    };

    // Filter-aware findFirst mirroring Prisma's `where: { weekKey }` semantics:
    // the null-keyed preview run never matches an exact weekKey filter. (A
    // `triggeredAt`-based lookup, by contrast, WOULD have matched it.)
    mockDb.digestRun.findFirst.mockImplementation(
      async ({ where }: { where: { weekKey?: Date } }) => {
        const runs = [previewRun];
        return runs.find((r) => r.weekKey?.getTime() === where.weekKey?.getTime()) ?? null;
      },
    );
    mockDb.digestRun.create.mockResolvedValue({
      id: "weekly-run",
      weekKey: weekStart,
      status: "running",
    });

    // The preview user is an active subscriber this week.
    mockDb.user.findMany.mockResolvedValue(users("preview-user"));
    // Resume filter is scoped to the WEEKLY run id — the preview user's digest
    // lives on the preview run, so nothing is delivered under the weekly run
    // yet and they stay pending.
    mockDb.digest.findMany
      .mockResolvedValueOnce([]) // resume filter for weekly-run: nothing delivered
      .mockResolvedValueOnce([delivered("preview-user")]); // final recount

    const result = await runDigestCron();

    // A fresh weekly run was created — the preview run was NOT adopted.
    expect(result.resumed).toBe(false);
    expect(result.runId).toBe("weekly-run");
    expect(mockDb.digestRun.create).toHaveBeenCalledTimes(1);
    expect(mockDb.digestRun.create.mock.calls[0][0].data.weekKey).toEqual(weekStart);

    // The resume lookup was scoped by weekKey, not the collision-prone triggeredAt.
    const where = mockDb.digestRun.findFirst.mock.calls[0][0].where;
    expect(where).toHaveProperty("weekKey");
    expect(where).not.toHaveProperty("triggeredAt");

    // The preview user still got their weekly digest, attached to the weekly
    // run — not the preview run.
    expect(assembleMock).toHaveBeenCalledWith("preview-user", "weekly-run", RELEVANCE);
    expect(result.unserved).toBe(0);
    // No false "retry left users unserved" ERROR page.
    expect(sentryMock.captureMessage).not.toHaveBeenCalled();
  });
});

describe("runDigestCron — SMS-only subscriber (issue #217)", () => {
  // The cron's user query used to filter on emailOptIn:true alone, silently
  // dropping subscribers who had unsubscribed from email but were still opted
  // into SMS with a mobile on file. The fix uses an OR condition so a user
  // entitled to ANY channel enters the pipeline — assembleAndSendDigest
  // independently gates each channel (email → skipped_optout, SMS → sent).
  //
  // The mock simulates what the corrected Prisma WHERE clause produces: it
  // returns these users. The test proves they enter the assembly loop correctly.
  it("processes an SMS-only subscriber (emailOptIn:false, smsOptIn:true, mobile present)", async () => {
    const smsUserEmail = "sms-only@example.com";
    mockDb.user.findMany.mockResolvedValue([
      { id: "sms-user", email: smsUserEmail },
    ]);
    mockDb.digest.findMany
      .mockResolvedValueOnce([]) // resume filter: nothing delivered yet
      .mockResolvedValueOnce([{ userId: "sms-user", emailStatus: "skipped_optout", smsStatus: "sent" }]); // final recount

    // The user enters the pipeline. assembleAndSendDigest will independently
    // gate email (skipped_optout because emailOptIn:false) and SMS (sent because
    // smsOptIn:true && mobile_e164 set) — this test proves the cron loop DOES
    // NOT skip them at the pre-filter.
    const result = await runDigestCron();

    expect(assembleMock).toHaveBeenCalledTimes(1);
    expect(assembleMock).toHaveBeenCalledWith("sms-user", expect.any(String), RELEVANCE);
    expect(result.usersProcessed).toBe(1);
    expect(result.unserved).toBe(0);
  });

  it("handles email-only subscriber alongside SMS-only subscriber (mixed channel)", async () => {
    mockDb.user.findMany.mockResolvedValue([
      { id: "email-user", email: "email@example.com" },
      { id: "sms-user", email: "sms@example.com" },
    ]);
    mockDb.digest.findMany
      .mockResolvedValueOnce([]) // resume filter: nothing delivered yet
      .mockResolvedValueOnce([
        { userId: "email-user", emailStatus: "sent", smsStatus: "skipped" },
        { userId: "sms-user", emailStatus: "skipped_optout", smsStatus: "sent" },
      ]);

    const result = await runDigestCron();

    expect(assembleMock).toHaveBeenCalledTimes(2);
    expect(result.usersProcessed).toBe(2);
    expect(result.unserved).toBe(0);
  });

  it("builds the OR filter in findMany (both-opt-outs-excluded — the Prisma query shape)", async () => {
    mockDb.user.findMany.mockResolvedValue([]);
    mockDb.digest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runDigestCron();

    // Capture the WHERE clause passed to findMany and verify the OR condition
    // exists — this is the shape-level proof that a user with both opt-ins false
    // (or smsOptIn:true but no mobile) is excluded by the query itself.
    const where = mockDb.user.findMany.mock.calls[0][0].where;
    expect(where).toHaveProperty("OR");
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { emailOptIn: true },
        { smsOptIn: true, mobile_e164: { not: null } },
      ]),
    );
    // emailOptIn:true is no longer a flat condition at the WHERE root
    expect(where.emailOptIn).toBeUndefined();
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
