// Issue #11: the email digest was capped at top-3, starving the thumbs feedback
// moat. It is restored to the wedge's 5–15 range (DIGEST_EMAIL_MAX_CARDS = 15)
// while SMS stays top-3 (DIGEST_SMS_MAX_CARDS = 3). This proves both bounds hold
// from the same relevance result set.
//
// Fully mocked DB — no network, no Prisma.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DIGEST_EMAIL_MAX_CARDS,
  DIGEST_SMS_MAX_CARDS,
} from "@/modules/digest/constants";

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
  lgaBundles: [{ bundle: { label: "Western Sydney" } }],
};

// 16 candidates — one over the email cap, to prove the slice truncates.
function makeRelevance(n: number) {
  return {
    fallbackUsed: false,
    stats: { ruleFiltered: n, vectorRanked: n, rerankInput: n, rerankSurfaced: n },
    results: Array.from({ length: n }, (_, i) => ({
      daId: `da-${i + 1}`,
      score: 2.5,
      why: `metal reroof #${i + 1}`,
      candidate: {
        address: `${i + 1} Test St, Blacktown`,
        council: "Blacktown",
        estimatedValue: 500000,
        applicantName: "ACME Roofing",
        portalUrl: `https://portal.example/da-${i + 1}`,
        description: "Reroof of existing dwelling with Colorbond.",
      },
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

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

describe("assembleAndSendDigest — email 5–15 cards, SMS top-3 (issue #11)", () => {
  it("caps the email at DIGEST_EMAIL_MAX_CARDS when more leads are available", async () => {
    const result = await assembleAndSendDigest(
      "user-1",
      "run-1",
      makeRelevance(DIGEST_EMAIL_MAX_CARDS + 1),
    );

    expect(result.daCount).toBe(DIGEST_EMAIL_MAX_CARDS);
    expect(mockDb.digestDa.create).toHaveBeenCalledTimes(DIGEST_EMAIL_MAX_CARDS);

    const emailProps = sendEmailMock.mock.calls[0][0].props;
    expect(emailProps.cards).toHaveLength(DIGEST_EMAIL_MAX_CARDS);
    expect(emailProps.leadCount).toBe(DIGEST_EMAIL_MAX_CARDS);

    // SMS is trimmed to top-3 independently of the email size — one ShortUrl
    // upsert per SMS card is the tell.
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(mockDb.shortUrl.upsert).toHaveBeenCalledTimes(DIGEST_SMS_MAX_CARDS);
  });

  it("surfaces every card when fewer than the cap are available (mid-range week)", async () => {
    await assembleAndSendDigest("user-1", "run-1", makeRelevance(7));

    const emailProps = sendEmailMock.mock.calls[0][0].props;
    expect(emailProps.cards).toHaveLength(7);
    // Still only top-3 to SMS.
    expect(mockDb.shortUrl.upsert).toHaveBeenCalledTimes(DIGEST_SMS_MAX_CARDS);
  });
});
