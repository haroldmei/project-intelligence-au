// Acceptance test for issue #179: the weekly-digest bulk send must carry the
// RFC-8058 one-click unsubscribe headers so Gmail/Yahoo's Feb-2024 bulk-sender
// rules are met and the inbox "Unsubscribe" affordance works — otherwise the
// whole product (a delivered weekly email) degrades toward spam.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, sendSmsMock, sendEmailMock, captureServerMock } = vi.hoisted(() => ({
  mockDb: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    digest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    digestDa: { create: vi.fn() },
    daFeedback: { count: vi.fn(), findMany: vi.fn() },
    shortUrl: { upsert: vi.fn() },
  },
  sendSmsMock: vi.fn(),
  sendEmailMock: vi.fn(),
  captureServerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
// Only the network send is stubbed; buildListUnsubscribeHeaders lives in its own
// unmocked module (@/lib/email/list-unsubscribe), so the real headers are built.
vi.mock("@/lib/email/client", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/sms/client", () => ({
  sendSms: sendSmsMock,
  SMS_SENDER_ID: "PI-AU",
  SMS_STOP_FOOTER: "Reply STOP to opt out.",
}));
vi.mock("@/lib/analytics/server", () => ({ captureServer: captureServerMock }));

import { assembleAndSendDigest } from "@/modules/digest/assemble";

const SNAPSHOT = {
  id: "user-1",
  email: "tradie@example.com",
  smsOptIn: false,
  emailOptIn: true,
  mobile_e164: null,
  personalisationNotifiedAt: new Date(),
  lgaBundles: [{ bundle: { label: "Inner West" } }],
};

const RELEVANCE = {
  fallbackUsed: false,
  stats: { ruleFiltered: 20, vectorRanked: 5, rerankInput: 5, rerankSurfaced: 1 },
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
  mockDb.digest.update.mockResolvedValue({});
  mockDb.digest.count.mockResolvedValue(0);
  mockDb.daFeedback.count.mockResolvedValue(0);
  mockDb.daFeedback.findMany.mockResolvedValue([]);
  sendEmailMock.mockResolvedValue(undefined);
});

describe("assembleAndSendDigest — RFC-8058 List-Unsubscribe headers (issue #179)", () => {
  it("sends the weekly digest with one-click unsubscribe headers pointing at the unsubscribe endpoint", async () => {
    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.template).toBe("weekly-digest");

    // (a) the acceptance criterion: both headers present, one-click POST value.
    expect(call.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const listUnsub = call.headers?.["List-Unsubscribe"] as string;
    expect(listUnsub).toMatch(/^<https?:\/\/.+\/api\/unsubscribe\/.+>$/);

    // The header URL and the in-body footer link resolve to the same token, so
    // the inbox one-click and the visible link opt out the same subscriber.
    const headerUrl = listUnsub.slice(1, -1);
    expect(headerUrl).toBe(call.props.unsubscribeUrl);
  });
});
