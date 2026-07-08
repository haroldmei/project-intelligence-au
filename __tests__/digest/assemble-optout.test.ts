// Send-time opt-out re-check for the digest assembler (issue #23).
// Spam Act 2003: an opt-out takes effect IMMEDIATELY — including for a user
// whose digest was already assembled earlier in the same run. assembleAndSend-
// Digest must re-read the opt-in flags from the DB at send time, not trust the
// snapshot loaded when assembly started.
//
// Fully mocked (no DB): the assembly-time snapshot says opted-in while the
// fresh read says opted-out — proving the guard reads live state.
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

// The snapshot loaded at assembly start — user LOOKS opted-in here.
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
  mockDb.digest.findFirst.mockResolvedValue(null); // no prior row — first assembly
  mockDb.digest.create.mockResolvedValue({ id: "digest-1" });
  mockDb.digest.count.mockResolvedValue(0);
  mockDb.daFeedback.findMany.mockResolvedValue([]);
  mockDb.digestDa.create.mockResolvedValue({});
  mockDb.shortUrl.upsert.mockResolvedValue({});
  mockDb.digest.update.mockResolvedValue({});
  sendEmailMock.mockResolvedValue(undefined);
  sendSmsMock.mockResolvedValue(true);
});

describe("assembleAndSendDigest — send-time opt-out re-check", () => {
  it("does NOT send SMS when a STOP landed mid-run (fresh read says opted out)", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      emailOptIn: true,
      smsOptIn: false, // opted out after assembly started
      mobile_e164: "+61400000001",
    });

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(result.smsStatus).toBe("skipped");
    expect(sendEmailMock).toHaveBeenCalledTimes(1); // email still opted in
  });

  it("sends a compliant SMS when still opted in at send time", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      emailOptIn: true,
      smsOptIn: true,
      mobile_e164: "+61400000001",
    });

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(result.smsStatus).toBe("sent");
    const body = sendSmsMock.mock.calls[0][0].body as string;
    expect(body).toContain("PI-AU");
    expect(body).toContain("Reply STOP to opt out.");
  });

  it("does NOT send email when the user unsubscribed mid-run", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      emailOptIn: false, // unsubscribed after assembly started
      smsOptIn: false,
      mobile_e164: "+61400000001",
    });

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(result.emailStatus).toBe("skipped_optout");
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});
