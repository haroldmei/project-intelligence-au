// Weekly precision recap stat (CF-1.7, issue #51). Proves assemble threads the
// trailing-4-week precision into the email props as `precisionBadge` — but only
// from week 4 (this send counts as the current week, so 3 prior sends is enough),
// and never before. Fully mocked DB — no network, no Prisma.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, sendSmsMock, sendEmailMock } = vi.hoisted(() => ({
  mockDb: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    digest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    digestDa: { create: vi.fn() },
    daFeedback: { findMany: vi.fn() },
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
  smsOptIn: false,
  emailOptIn: true,
  mobile_e164: null,
  lgaBundles: [{ bundle: { label: "Inner West" } }],
};

const RELEVANCE = {
  fallbackUsed: false,
  stats: { ruleFiltered: 20, vectorRanked: 5, rerankInput: 5, rerankSurfaced: 2 },
  results: [
    {
      daId: "da-1",
      score: 4.5,
      why: "Roofing scope match",
      candidate: {
        address: "1 Roof St",
        council: "Inner West",
        estimatedValue: 150000,
        applicantName: "Acme",
        description: "Re-roof works",
        rawScopeText: "reroof",
        portalUrl: "https://council.nsw.gov.au/da/da-1",
        approvalPathway: "da",
        constructionCertifiedAt: null,
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
    smsOptIn: false,
    mobile_e164: null,
  });
  mockDb.digest.findFirst.mockResolvedValue(null);
  mockDb.digest.create.mockResolvedValue({ id: "digest-1" });
  mockDb.digestDa.create.mockResolvedValue({});
  mockDb.shortUrl.upsert.mockResolvedValue({});
  mockDb.digest.update.mockResolvedValue({});
  sendEmailMock.mockResolvedValue(undefined);
  sendSmsMock.mockResolvedValue(true);
  // Thumbs: 3 up, 1 down → 75% precision.
  mockDb.daFeedback.findMany.mockResolvedValue([
    { feedback: "up" },
    { feedback: "up" },
    { feedback: "up" },
    { feedback: "down" },
  ]);
});

describe("assembleAndSendDigest — precision recap (CF-1.7)", () => {
  it("threads precisionBadge into the email from week 4 (3 prior sends + this one)", async () => {
    mockDb.digest.count.mockResolvedValue(3);
    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    const props = sendEmailMock.mock.calls[0][0].props;
    expect(props.precisionBadge).toEqual({ precision: 75, weeks: 4 });
  });

  it("omits precisionBadge before week 4 (only 2 prior sends + this one = 3)", async () => {
    mockDb.digest.count.mockResolvedValue(2);
    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    const props = sendEmailMock.mock.calls[0][0].props;
    expect(props.precisionBadge).toBeUndefined();
  });

  it("omits precisionBadge at week 4+ when the user has rated nothing", async () => {
    mockDb.digest.count.mockResolvedValue(9);
    mockDb.daFeedback.findMany.mockResolvedValue([]);
    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    const props = sendEmailMock.mock.calls[0][0].props;
    expect(props.precisionBadge).toBeUndefined();
  });

  it("excludes the in-flight digest from the sent-week count", async () => {
    mockDb.digest.count.mockResolvedValue(4);
    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    const where = mockDb.digest.count.mock.calls[0][0].where;
    expect(where.NOT).toEqual({ id: "digest-1" });
    expect(where.sentAt).toEqual({ not: null });
  });
});
