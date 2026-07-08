// Regression for issue #49: the in-email 👍/👎 links must reach the HMAC handler.
//
// buildFeedbackUrl() used to emit `/api/feedback?token=...` (a query param), but
// the token-validating GET handler lives at the dynamic `[token]` PATH segment
// (src/app/api/feedback/[token]/route.ts). /api/feedback itself is POST-only
// (Lucia portal), so every email tap 405'd and recorded nothing — silently
// killing the FR-023 email feedback capture that feeds the FR-025 personalisation
// loop. This test taps the EXACT url buildFeedbackUrl() emits and asserts it
// reaches the handler, writes a da_feedback row, and redirects (not 405).
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, sendSmsMock, sendEmailMock, captureServerMock } = vi.hoisted(() => ({
  mockDb: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    digest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    digestDa: { create: vi.fn() },
    daFeedback: { findMany: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    shortUrl: { upsert: vi.fn() },
  },
  sendSmsMock: vi.fn(),
  sendEmailMock: vi.fn(),
  captureServerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/email/client", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/sms/client", () => ({
  sendSms: sendSmsMock,
  SMS_SENDER_ID: "PI-AU",
  SMS_STOP_FOOTER: "Reply STOP to opt out.",
}));
vi.mock("@/lib/analytics/server", () => ({ captureServer: captureServerMock }));

// NOTE: @/modules/feedback/service is intentionally NOT mocked — we want the real
// recordFeedback to run so the assertion proves an actual da_feedback upsert.
import { assembleAndSendDigest } from "@/modules/digest/assemble";
import { GET as feedbackTokenGET } from "@/app/api/feedback/[token]/route";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL!; // "http://localhost:3000"

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
  mockDb.digest.count.mockResolvedValue(0);
  mockDb.daFeedback.findMany.mockResolvedValue([]);
  mockDb.daFeedback.upsert.mockResolvedValue({});
  sendEmailMock.mockResolvedValue(undefined);
  sendSmsMock.mockResolvedValue(true);
});

// Extract the token param the way Next.js hands it to the [token] route: the
// last path segment, URL-decoded.
function tokenFromUrl(url: string): string {
  const { pathname } = new URL(url);
  return decodeURIComponent(pathname.split("/").pop()!);
}

describe("assembleAndSendDigest — in-email feedback link routing (issue #49)", () => {
  it("emits the path form, not the ?token= query form that 405s", async () => {
    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    const props = sendEmailMock.mock.calls[0][0].props;
    const { thumbUpUrl, thumbDownUrl } = props.cards[0];

    for (const url of [thumbUpUrl, thumbDownUrl]) {
      expect(url).toContain(`${APP_BASE}/api/feedback/`);
      // The bug: a query param never reaches the [token] handler.
      expect(url).not.toContain("/api/feedback?token=");
      expect(new URL(url).search).toBe("");
    }
  });

  it("thumb-up tap on the emitted URL reaches the HMAC handler, writes da_feedback, and 302s (not 405)", async () => {
    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);
    const { thumbUpUrl } = sendEmailMock.mock.calls[0][0].props.cards[0];

    const token = tokenFromUrl(thumbUpUrl);
    const res = await feedbackTokenGET(new Request(thumbUpUrl), {
      params: Promise.resolve({ token }),
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith(`${APP_BASE}/digest?`)).toBe(true);
    expect(location).toContain("feedback=recorded");

    // The vote is actually recorded for (userId, daId) via the real service.
    expect(mockDb.daFeedback.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockDb.daFeedback.upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({ userId_daId: { userId: "user-1", daId: "da-1" } });
    expect(upsertArg.create).toMatchObject({
      userId: "user-1",
      daId: "da-1",
      feedback: "up",
      source: "email",
    });
  });

  it("thumb-down tap records a down vote for the same DA", async () => {
    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);
    const { thumbDownUrl } = sendEmailMock.mock.calls[0][0].props.cards[0];

    const token = tokenFromUrl(thumbDownUrl);
    const res = await feedbackTokenGET(new Request(thumbDownUrl), {
      params: Promise.resolve({ token }),
    });

    expect(res.status).toBe(302);
    expect(mockDb.daFeedback.upsert.mock.calls[0][0].create).toMatchObject({
      userId: "user-1",
      daId: "da-1",
      feedback: "down",
      source: "email",
    });
  });
});
