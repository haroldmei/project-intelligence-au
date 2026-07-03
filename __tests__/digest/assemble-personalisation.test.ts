// Issue #96 A3: one-time "your digest is now personalised" note. FR-025 thumbs
// personalisation activates at ≥ 25 all-time feedback rows; the week it kicks
// in, the digest email carries a one-time note and User.personalisationNotifiedAt
// is stamped so it never repeats. Fully mocked DB — no network, no Prisma.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, sendSmsMock, sendEmailMock } = vi.hoisted(() => ({
  mockDb: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
  smsOptIn: false,
  emailOptIn: true,
  mobile_e164: null,
  personalisationNotifiedAt: null,
  lgaBundles: [{ bundle: { label: "Western Sydney" } }],
};

const RELEVANCE = {
  fallbackUsed: false,
  stats: { ruleFiltered: 1, vectorRanked: 1, rerankInput: 1, rerankSurfaced: 1 },
  results: [
    {
      daId: "da-1",
      score: 2.5,
      why: "metal reroof",
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
  mockDb.user.findUnique.mockResolvedValue({ emailOptIn: true, smsOptIn: false, mobile_e164: null });
  mockDb.digest.findFirst.mockResolvedValue(null);
  mockDb.digest.create.mockResolvedValue({ id: "digest-1" });
  mockDb.digest.count.mockResolvedValue(0);
  mockDb.daFeedback.findMany.mockResolvedValue([]);
  mockDb.digestDa.create.mockResolvedValue({});
  mockDb.shortUrl.upsert.mockResolvedValue({});
  mockDb.digest.update.mockResolvedValue({});
  mockDb.user.update.mockResolvedValue({});
  sendEmailMock.mockResolvedValue(undefined);
  sendSmsMock.mockResolvedValue(true);
});

describe("assembleAndSendDigest — personalisation note (A3)", () => {
  it("renders the note and stamps personalisationNotifiedAt when feedback ≥ 25 and not yet notified", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue({ ...SNAPSHOT, personalisationNotifiedAt: null });
    mockDb.daFeedback.count.mockResolvedValue(25);

    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendEmailMock.mock.calls[0][0].props.personalisationActivated).toBe(true);
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { personalisationNotifiedAt: expect.any(Date) },
    });
  });

  it("does not render the note or query the count once already notified", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue({
      ...SNAPSHOT,
      personalisationNotifiedAt: new Date("2026-06-01T00:00:00Z"),
    });

    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendEmailMock.mock.calls[0][0].props.personalisationActivated).toBe(false);
    expect(mockDb.daFeedback.count).not.toHaveBeenCalled();
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("first digest at the threshold carries the note; the next digest for the same user omits it", async () => {
    // Acceptance criterion (#111): run assembly twice for one user. Week 1 the
    // user has just crossed 25 feedback rows with personalisationNotifiedAt
    // still null — the note fires and the timestamp is stamped. Week 2 re-reads
    // that stamped timestamp, so the note must be suppressed and never re-query
    // the feedback count. This chains the write-guard to the read-guard so they
    // can't silently drift apart.
    mockDb.user.findUniqueOrThrow.mockResolvedValue({ ...SNAPSHOT, personalisationNotifiedAt: null });
    mockDb.daFeedback.count.mockResolvedValue(25);

    await assembleAndSendDigest("user-1", "run-week-1", RELEVANCE);

    expect(sendEmailMock.mock.calls[0][0].props.personalisationActivated).toBe(true);
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { personalisationNotifiedAt: expect.any(Date) },
    });
    // Capture the timestamp week 1 actually stamped and feed it back in as the
    // user's stored value for week 2 — modelling the same user a week later.
    const stampedAt: Date = mockDb.user.update.mock.calls[0][0].data.personalisationNotifiedAt;

    vi.clearAllMocks();
    mockDb.user.findUnique.mockResolvedValue({ emailOptIn: true, smsOptIn: false, mobile_e164: null });
    mockDb.digest.findFirst.mockResolvedValue(null);
    mockDb.digest.create.mockResolvedValue({ id: "digest-2" });
    mockDb.digest.count.mockResolvedValue(1);
    mockDb.daFeedback.findMany.mockResolvedValue([]);
    mockDb.digestDa.create.mockResolvedValue({});
    mockDb.digest.update.mockResolvedValue({});
    mockDb.user.update.mockResolvedValue({});
    sendEmailMock.mockResolvedValue(undefined);
    mockDb.user.findUniqueOrThrow.mockResolvedValue({ ...SNAPSHOT, personalisationNotifiedAt: stampedAt });

    await assembleAndSendDigest("user-1", "run-week-2", RELEVANCE);

    expect(sendEmailMock.mock.calls[0][0].props.personalisationActivated).toBe(false);
    expect(mockDb.daFeedback.count).not.toHaveBeenCalled();
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("does not stamp the timestamp when feedback is below the threshold", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue({ ...SNAPSHOT, personalisationNotifiedAt: null });
    mockDb.daFeedback.count.mockResolvedValue(24);

    await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(sendEmailMock.mock.calls[0][0].props.personalisationActivated).toBe(false);
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("does not stamp the timestamp when the email is suppressed (unsubscribed)", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue({ ...SNAPSHOT, personalisationNotifiedAt: null });
    mockDb.daFeedback.count.mockResolvedValue(30);
    // Send-time re-read says the user unsubscribed — email skipped.
    mockDb.user.findUnique.mockResolvedValue({ emailOptIn: false, smsOptIn: false, mobile_e164: null });

    const result = await assembleAndSendDigest("user-1", "run-1", RELEVANCE);

    expect(result.emailStatus).toBe("skipped_optout");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });
});
