// Issue #58 (FR-010 quiet week): a week where nothing scores into the digest
// must still send a reassuring "we checked N DAs" email rather than an empty
// "0 leads" one. This proves assemble threads the DAs-scanned count
// (relevance.stats.ruleFiltered) into the email props as `dasChecked`, and that
// leadCount is 0 with no cards.
//
// Fully mocked DB — no network, no Prisma.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, sendSmsMock, sendEmailMock } = vi.hoisted(() => ({
  mockDb: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    digest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    digestDa: { create: vi.fn() },
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
  lgaBundles: [
    { bundle: { label: "Inner West" } },
    { bundle: { label: "Eastern Suburbs" } },
  ],
};

// Zero surfaced leads, but the rule pass scanned 143 DAs in the user's LGAs.
const QUIET_RELEVANCE = {
  fallbackUsed: false,
  stats: { ruleFiltered: 143, vectorRanked: 0, rerankInput: 0, rerankSurfaced: 0 },
  results: [],
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
  mockDb.digest.findFirst.mockResolvedValue(null);
  mockDb.digest.create.mockResolvedValue({ id: "digest-1" });
  mockDb.digest.count.mockResolvedValue(0);
  mockDb.daFeedback.findMany.mockResolvedValue([]);
  mockDb.digestDa.create.mockResolvedValue({});
  mockDb.shortUrl.upsert.mockResolvedValue({});
  mockDb.digest.update.mockResolvedValue({});
  sendEmailMock.mockResolvedValue(undefined);
  sendSmsMock.mockResolvedValue(true);
});

describe("assembleAndSendDigest — FR-010 quiet week (issue #58)", () => {
  it("threads the DAs-scanned count into the email as dasChecked", async () => {
    const result = await assembleAndSendDigest("user-1", "run-1", QUIET_RELEVANCE);

    expect(result.daCount).toBe(0);
    expect(result.emailStatus).toBe("sent");

    const emailProps = sendEmailMock.mock.calls[0][0].props;
    expect(emailProps.leadCount).toBe(0);
    expect(emailProps.cards).toHaveLength(0);
    expect(emailProps.dasChecked).toBe(143);
  });

  it("still sends the email and persists no DA cards on a quiet week", async () => {
    await assembleAndSendDigest("user-1", "run-1", QUIET_RELEVANCE);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    // No leads → no DigestDa rows, and no SMS (nothing to text).
    expect(mockDb.digestDa.create).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});
