// Send-time service-area snapshot (issue #138). The history list and digest
// detail header used to stamp the user's CURRENT area onto every past digest,
// so widening the area retroactively relabelled old digests. assembleAndSendDigest
// must freeze the area label on the Digest row at create time — the send-time
// half of the fix (the read half lives in the portal loaders + pages).
//
// Fully mocked (no DB): assert the create() payload carries the joined label.
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

function userWithBundles(labels: string[]) {
  return {
    id: "user-1",
    email: "tradie@example.com",
    smsOptIn: false,
    emailOptIn: true,
    mobile_e164: null,
    lgaBundles: labels.map((label) => ({ bundle: { label } })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.user.findUnique.mockResolvedValue({
    emailOptIn: true,
    smsOptIn: false,
    mobile_e164: null,
  });
  mockDb.digest.findFirst.mockResolvedValue(null);
  mockDb.digest.create.mockResolvedValue({ id: "digest-1" });
  mockDb.digest.count.mockResolvedValue(0);
  mockDb.daFeedback.findMany.mockResolvedValue([]);
  mockDb.digestDa.create.mockResolvedValue({});
  mockDb.digest.update.mockResolvedValue({});
  sendEmailMock.mockResolvedValue(undefined);
});

describe("assembleAndSendDigest — area snapshot (issue #138)", () => {
  it("freezes the joined area label on the Digest row at create time", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue(
      userWithBundles(["Western Sydney"]),
    );

    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(mockDb.digest.create).toHaveBeenCalledTimes(1);
    expect(mockDb.digest.create.mock.calls[0][0].data).toMatchObject({
      areaLabel: "Western Sydney",
    });
  });

  it("joins multiple bundles with ' + ' — the same shape the portal renders", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue(
      userWithBundles(["Western Sydney", "Northern Sydney"]),
    );

    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(mockDb.digest.create.mock.calls[0][0].data.areaLabel).toBe(
      "Western Sydney + Northern Sydney",
    );
  });

  it("stores null when the user has no bundles (portal falls back to live area)", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue(userWithBundles([]));

    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(mockDb.digest.create.mock.calls[0][0].data.areaLabel).toBeNull();
  });
});
