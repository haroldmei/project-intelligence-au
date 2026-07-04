// Concurrent-overlap re-send protection for the digest assembler (issue #93).
// Two overlapping cron invocations can reach assembleAndSendDigest for the same
// (userId, runId) at once. The @@unique([userId, runId]) lets only ONE create
// win; the loser's create throws P2002 and must back off WITHOUT sending — no
// second email, no duplicate DigestDa cards. Mirrors the StormBrief pattern.
//
// Fully mocked (no DB): db.digest.create is made to throw a P2002 to simulate
// losing the race, and findFirstOrThrow returns the winner's row.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, sendSmsMock, sendEmailMock, captureMock } = vi.hoisted(() => ({
  mockDb: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    digest: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    digestDa: { create: vi.fn() },
    daFeedback: { findMany: vi.fn(), count: vi.fn() },
    shortUrl: { upsert: vi.fn() },
  },
  sendSmsMock: vi.fn(),
  sendEmailMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/email/client", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/sms/client", () => ({
  sendSms: sendSmsMock,
  SMS_SENDER_ID: "PI-AU",
  SMS_STOP_FOOTER: "Reply STOP to opt out.",
}));
vi.mock("@/lib/analytics/server", () => ({ captureServer: captureMock }));

import { assembleAndSendDigest } from "@/modules/digest/assemble";

const SNAPSHOT = {
  id: "user-1",
  email: "tradie@example.com",
  smsOptIn: true,
  emailOptIn: true,
  mobile_e164: "+61400000001",
  lgaBundles: [{ bundle: { label: "Western Sydney" } }],
};

const RELEVANCE = {
  fallbackUsed: false,
  stats: { ruleFiltered: 1, vectorRanked: 1, rerankInput: 1, rerankSurfaced: 1 },
  results: [
    {
      daId: "da-1",
      score: 2.5,
      why: "metal reroof in your area",
      candidate: {
        address: "1 Test St, Blacktown",
        council: "Blacktown",
        estimatedValue: 500000,
        applicantName: "ACME Roofing",
        portalUrl: "https://portal.example/da-1",
        description: "Reroof of existing dwelling with Colorbond.",
      },
    },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

/** A Prisma unique-constraint violation, as thrown by db.digest.create. */
function p2002() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.user.findUniqueOrThrow.mockResolvedValue({ ...SNAPSHOT });
  mockDb.user.findUnique.mockResolvedValue({
    emailOptIn: true,
    smsOptIn: true,
    mobile_e164: "+61400000001",
  });
  mockDb.digest.count.mockResolvedValue(0);
  mockDb.daFeedback.findMany.mockResolvedValue([]);
  mockDb.digestDa.create.mockResolvedValue({});
  mockDb.shortUrl.upsert.mockResolvedValue({});
  mockDb.digest.update.mockResolvedValue({});
  sendEmailMock.mockResolvedValue(undefined);
  sendSmsMock.mockResolvedValue(true);
});

describe("assembleAndSendDigest — concurrent overlap (issue #93)", () => {
  it("loses the create race → sends nothing, duplicates nothing, adopts the winner's row", async () => {
    // Both invocations saw no prior row...
    mockDb.digest.findFirst.mockResolvedValue(null);
    // ...but this one loses the atomic create.
    mockDb.digest.create.mockRejectedValue(p2002());
    // The winner already committed its row (mid-send: email still pending).
    mockDb.digest.findFirstOrThrow.mockResolvedValue({
      id: "digest-winner",
      daCount: 1,
      emailStatus: "pending",
      smsStatus: "skipped",
    });

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendEmailMock).not.toHaveBeenCalled(); // no double-mail
    expect(sendSmsMock).not.toHaveBeenCalled(); // no double-text
    expect(mockDb.digestDa.create).not.toHaveBeenCalled(); // no duplicate cards
    expect(mockDb.digest.update).not.toHaveBeenCalled(); // don't stomp the winner
    expect(captureMock).not.toHaveBeenCalled(); // no double funnel event
    expect(result.digestId).toBe("digest-winner");
  });

  it("re-throws non-P2002 create errors (not a dedupe backoff)", async () => {
    mockDb.digest.findFirst.mockResolvedValue(null);
    mockDb.digest.create.mockRejectedValue(new Error("connection reset"));

    await expect(assembleAndSendDigest("user-1", "run-1", RELEVANCE)).rejects.toThrow(
      "connection reset",
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("wins the create race → sends normally and persists the cards once", async () => {
    mockDb.digest.findFirst.mockResolvedValue(null);
    mockDb.digest.create.mockResolvedValue({ id: "digest-1" });

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(mockDb.digest.create).toHaveBeenCalledTimes(1);
    expect(mockDb.digest.findFirstOrThrow).not.toHaveBeenCalled();
    expect(mockDb.digestDa.create).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(result.emailStatus).toBe("sent");
  });
});
