// Digest recovery must re-send the PERSISTED cards, never a fresh re-score (issue #196).
//
// CF-1.3 is the core promise: the email a user finally receives must list the
// same leads as their portal/history/CSV. The primary tick persists DigestDa
// rows; if the Resend send fails, the retry tick recovers. The recovery email
// must be built from those persisted rows — NOT from a fresh, non-deterministic
// relevance re-run that could surface a different lead set or (worst case)
// collapse to a 0-lead "quiet week, nothing strong" reassurance email while
// 5+ real leads sit persisted for the run.
//
// Fully mocked (no DB): db.digestDa.findMany returns the primary tick's rows.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, sendSmsMock, sendEmailMock } = vi.hoisted(() => ({
  mockDb: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    digest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    digestDa: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
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

// Five DigestDa rows the primary tick persisted for this run, in rank order.
// These are the immutable source of truth for the recovery email/SMS/portal/CSV.
const PERSISTED = [
  { rank: 1, daId: "da-1", why: "metal reroof · Blacktown", addr: "1 Alpha St, Blacktown", council: "Blacktown", val: 500000, appl: "ACME Roofing", score: 8, lc: "builder_pipeline" },
  { rank: 2, daId: "da-2", why: "colorbond replacement", addr: "2 Beta Rd, Penrith", council: "Penrith", val: 320000, appl: "Roof Co", score: 7, lc: "fast_track" },
  { rank: 3, daId: "da-3", why: "re-roof, tile to metal", addr: "3 Gamma Ave, Parramatta", council: "Parramatta", val: 210000, appl: "BuildRight", score: 6, lc: "strata_heritage" },
  { rank: 4, daId: "da-4", why: "roof replacement DA", addr: "4 Delta Cl, Liverpool", council: "Liverpool", val: 150000, appl: "Trades Pty", score: 5, lc: "builder_pipeline" },
  { rank: 5, daId: "da-5", why: "new roof over garage", addr: "5 Epsilon Pl, Fairfield", council: "Fairfield", val: 90000, appl: "SmallCo", score: 4, lc: "builder_pipeline" },
];

function persistedRows() {
  return PERSISTED.map((p) => ({
    daId: p.daId,
    whyMatched: p.why,
    relevanceScore: p.score,
    rank: p.rank,
    leadClass: p.lc,
    da: {
      address: p.addr,
      council: p.council,
      estimatedValue: p.val,
      description: `Scope for ${p.daId}`,
      applicantName: p.appl,
      portalUrl: `https://portal.example/${p.daId}`,
      constructionCertifiedAt: null,
    },
  }));
}

// A DIVERGENT fresh re-score — a different, smaller lead set. If the recovery
// path ever built the email from THIS instead of the persisted rows, the email
// would disagree with the portal. Passed only to prove it's ignored.
const DIVERGENT_RELEVANCE = {
  fallbackUsed: false,
  stats: { ruleFiltered: 3, vectorRanked: 3, rerankInput: 3, rerankSurfaced: 3 },
  results: [
    {
      daId: "da-99",
      score: 2.5,
      why: "totally different lead",
      candidate: {
        address: "99 Nowhere St",
        council: "Elsewhere",
        estimatedValue: 111,
        applicantName: "Ghost",
        portalUrl: "https://portal.example/da-99",
        description: "should never appear",
      },
    },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// The quiet-week collapse: the fresh re-run surfaced NOTHING (relevance floor /
// quiet-week gate returned results:[]). The recovery must NOT send the
// reassurance email while 5 real leads sit persisted for the run.
const QUIET_WEEK_RELEVANCE = {
  fallbackUsed: false,
  stats: { ruleFiltered: 42, vectorRanked: 0, rerankInput: 0, rerankSurfaced: 0 },
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
  mockDb.user.update.mockResolvedValue({});
  // The primary tick's Digest row: cards persisted, but the email send FAILED.
  mockDb.digest.findFirst.mockResolvedValue({
    id: "digest-1",
    emailStatus: "failed",
    smsStatus: "skipped",
    fallbackUsed: false,
  });
  // Cards WERE persisted on the primary tick → recovery path.
  mockDb.digestDa.count.mockResolvedValue(PERSISTED.length);
  mockDb.digestDa.findMany.mockResolvedValue(persistedRows());
  mockDb.digestDa.create.mockResolvedValue({});
  mockDb.daFeedback.findMany.mockResolvedValue([]);
  mockDb.daFeedback.count.mockResolvedValue(0);
  mockDb.digest.count.mockResolvedValue(0);
  mockDb.shortUrl.upsert.mockResolvedValue({});
  mockDb.digest.update.mockResolvedValue({});
  sendEmailMock.mockResolvedValue(undefined);
  sendSmsMock.mockResolvedValue(true);
});

function emailProps() {
  expect(sendEmailMock).toHaveBeenCalledTimes(1);
  return sendEmailMock.mock.calls[0][0].props as {
    leadCount: number;
    cards: Array<{ id: string; why: string }>;
  };
}

describe("assembleAndSendDigest — recovery re-sends the persisted cards (issue #196)", () => {
  it("relevance=null recovery builds the email from the 5 persisted DigestDa rows", async () => {
    const result = await assembleAndSendDigest("user-1", "run-1", null);

    // Never re-creates cards; reuses the primary row.
    expect(mockDb.digest.create).not.toHaveBeenCalled();
    expect(mockDb.digestDa.create).not.toHaveBeenCalled();

    // The email carries EXACTLY the persisted leads, in rank order, with the
    // persisted why-text — byte-equivalent to the portal digest.
    const props = emailProps();
    expect(props.leadCount).toBe(5);
    expect(props.cards.map((c) => c.id)).toEqual(["da-1", "da-2", "da-3", "da-4", "da-5"]);
    expect(props.cards.map((c) => c.why)).toEqual(PERSISTED.map((p) => p.why));

    // daCount reported to the caller matches the persisted rows (portal/CSV agree).
    expect(result.daCount).toBe(5);
    expect(result.emailStatus).toBe("sent");
  });

  it("ignores a DIVERGENT fresh re-score when cards are already persisted", async () => {
    // Even if a caller hands assemble a different, smaller relevance run, the
    // persisted cards win — the email must never list da-99.
    await assembleAndSendDigest("user-1", "run-1", DIVERGENT_RELEVANCE);

    const props = emailProps();
    expect(props.leadCount).toBe(5);
    expect(props.cards.map((c) => c.id)).toEqual(["da-1", "da-2", "da-3", "da-4", "da-5"]);
    expect(props.cards.some((c) => c.id === "da-99")).toBe(false);
    // The divergent re-score is never persisted over the frozen cards.
    expect(mockDb.digestDa.create).not.toHaveBeenCalled();
  });

  it("does NOT send a quiet-week email while DigestDa rows exist for the run", async () => {
    // The classic worst case: the fresh re-run collapsed to 0 leads (quiet-week
    // gate). The recovery must still send the 5 persisted leads, never the
    // "we checked N DAs, nothing strong" reassurance.
    await assembleAndSendDigest("user-1", "run-1", QUIET_WEEK_RELEVANCE);

    const props = emailProps();
    expect(props.leadCount).toBe(5); // NOT 0 → template renders cards, not the quiet-week branch
    expect(props.cards).toHaveLength(5);
  });

  it("does not rewrite the persisted daCount on the recovery update", async () => {
    await assembleAndSendDigest("user-1", "run-1", null);

    const updateArg = mockDb.digest.update.mock.calls.at(-1)?.[0];
    // daCount is left untouched so it keeps matching the already-persisted cards.
    expect(updateArg.data).not.toHaveProperty("daCount");
  });
});
