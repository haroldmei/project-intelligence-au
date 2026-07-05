// Per-channel idempotency for the digest assembler on a retry tick (issue #12).
// When the retry re-enters assembly for a user whose primary attempt partially
// failed, assembleAndSendDigest must reuse the existing Digest row and re-send
// ONLY the channel that failed — never double-mailing or double-texting the
// channel that already succeeded.
//
// Fully mocked (no DB): db.digest.findFirst returns the row the primary left.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, sendSmsMock, sendEmailMock } = vi.hoisted(() => ({
  mockDb: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    digest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    digestDa: { create: vi.fn(), count: vi.fn() },
    daFeedback: { findMany: vi.fn(), count: vi.fn() },
    shortUrl: { upsert: vi.fn() },
  },
  sendSmsMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/email/client", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/sms/client", () => ({
  sendSms: sendSmsMock,
  SMS_SENDER_ID: "PI-AU",
  SMS_STOP_FOOTER: "Reply STOP to opt out.",
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.user.findUniqueOrThrow.mockResolvedValue({ ...SNAPSHOT });
  mockDb.user.findUnique.mockResolvedValue({
    emailOptIn: true,
    smsOptIn: true,
    mobile_e164: "+61400000001",
  });
  mockDb.digest.create.mockResolvedValue({ id: "digest-1" });
  mockDb.digest.count.mockResolvedValue(0);
  // A genuine per-channel retry reuses a fully-assembled Digest whose cards are
  // already persisted, so the default reflects that. The issue #161 audit-stub
  // case (no cards yet) overrides this to 0 in its own test.
  mockDb.digestDa.count.mockResolvedValue(1);
  mockDb.daFeedback.findMany.mockResolvedValue([]);
  mockDb.digestDa.create.mockResolvedValue({});
  mockDb.shortUrl.upsert.mockResolvedValue({});
  mockDb.digest.update.mockResolvedValue({});
  sendEmailMock.mockResolvedValue(undefined);
  sendSmsMock.mockResolvedValue(true);
});

describe("assembleAndSendDigest — retry idempotency", () => {
  it("email already sent → retry does NOT re-send email, retries the failed SMS", async () => {
    mockDb.digest.findFirst.mockResolvedValue({
      id: "digest-1",
      emailStatus: "sent",
      smsStatus: "failed",
    });

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendEmailMock).not.toHaveBeenCalled(); // no double-mail
    expect(sendSmsMock).toHaveBeenCalledTimes(1); // SMS retried
    expect(mockDb.digest.create).not.toHaveBeenCalled(); // reused existing row
    expect(mockDb.digestDa.create).not.toHaveBeenCalled(); // cards not duplicated
    expect(result.emailStatus).toBe("sent");
    expect(result.smsStatus).toBe("sent");
  });

  it("SMS already sent → retry does NOT re-send SMS, retries the failed email", async () => {
    mockDb.digest.findFirst.mockResolvedValue({
      id: "digest-1",
      emailStatus: "failed",
      smsStatus: "sent",
    });

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendSmsMock).not.toHaveBeenCalled(); // no double-text
    expect(sendEmailMock).toHaveBeenCalledTimes(1); // email retried
    expect(result.emailStatus).toBe("sent");
    expect(result.smsStatus).toBe("sent");
  });

  it("both channels already delivered → retry sends nothing", async () => {
    mockDb.digest.findFirst.mockResolvedValue({
      id: "digest-1",
      emailStatus: "sent",
      smsStatus: "sent",
    });

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(result.emailStatus).toBe("sent");
    expect(result.smsStatus).toBe("sent");
  });

  it("first assembly (no prior row) sends both channels and persists cards", async () => {
    mockDb.digest.findFirst.mockResolvedValue(null);

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(mockDb.digest.create).toHaveBeenCalledTimes(1);
    expect(mockDb.digestDa.create).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(result.emailStatus).toBe("sent");
    expect(result.smsStatus).toBe("sent");
  });
});

// Issue #161: the primary tick threw, so the cron wrote a 'failed' AUDIT STUB
// Digest{daCount:0, emailStatus:"failed"} with NO DigestDa rows. On the retry
// tick that stub matches the reuse findFirst, but it is NOT a real digest — the
// cards were never persisted. The retry must backfill the cards and daCount, not
// treat the stub as "already assembled" and persist a delivered-but-empty digest.
describe("assembleAndSendDigest — recovering a failed audit stub (issue #161)", () => {
  it("retry over a 0-lead 'failed' stub backfills the cards, daCount, and sends", async () => {
    // The audit stub the primary tick's hard-failure branch left behind.
    mockDb.digest.findFirst.mockResolvedValue({
      id: "digest-1",
      emailStatus: "failed",
      smsStatus: null,
    });
    // Ground truth: no DigestDa rows persisted for this stub yet.
    mockDb.digestDa.count.mockResolvedValue(0);

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    // Reuses the stub row (never a second create), but MUST create the missing card.
    expect(mockDb.digest.create).not.toHaveBeenCalled();
    expect(mockDb.digestDa.create).toHaveBeenCalledTimes(RELEVANCE.results.length);
    expect(mockDb.digestDa.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ digestId: "digest-1", rank: 1 }) }),
    );

    // The email carries the real leads (primary send had failed, so re-send).
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(result.emailStatus).toBe("sent");

    // daCount is backfilled to the card count in the final update — the portal,
    // history, and CSV export read this, so 0 here is the empty-digest bug.
    const updateArg = mockDb.digest.update.mock.calls.at(-1)?.[0];
    expect(updateArg.data.daCount).toBe(RELEVANCE.results.length);
    expect(result.daCount).toBe(RELEVANCE.results.length);
  });

  it("a real per-channel retry (cards already persisted) does NOT re-create cards or rewrite daCount", async () => {
    mockDb.digest.findFirst.mockResolvedValue({
      id: "digest-1",
      emailStatus: "failed", // email failed, SMS already sent
      smsStatus: "sent",
    });
    mockDb.digestDa.count.mockResolvedValue(1); // cards were persisted on the primary tick

    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(mockDb.digestDa.create).not.toHaveBeenCalled();
    const updateArg = mockDb.digest.update.mock.calls.at(-1)?.[0];
    // daCount is left untouched so it keeps matching the already-persisted cards.
    expect(updateArg.data).not.toHaveProperty("daCount");
  });
});
