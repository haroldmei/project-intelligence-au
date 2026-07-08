// Issue #181 (system-design §7.3): when the Claude rerank is unavailable, the
// relevance layer degrades to embedding-only ranking and returns
// { fallbackUsed: true, fallbackReason: "llm_unavailable", results: [...] }.
// This proves assemble then STILL sends the digest — emailStatus "sent",
// fallbackUsed persisted, daCount > 0, and the distinct "basic mode" note passed
// to the email — rather than the user going unserved (NFR-019 delivery SLA).
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
import type { RelevanceRunResult } from "@/modules/relevance/run";

const SNAPSHOT = {
  id: "user-1",
  email: "tradie@example.com",
  smsOptIn: false,
  emailOptIn: true,
  mobile_e164: null,
  lgaBundles: [{ bundle: { label: "Western Sydney" } }],
};

// Embedding-only degraded result: mirrors runEmbeddingOnlyPath's shape — the
// spec placeholder "why", modelUsed "embedding-only", fallbackUsed true.
function degradedRelevance(n: number): RelevanceRunResult {
  return {
    fallbackUsed: true,
    fallbackReason: "llm_unavailable",
    stats: { ruleFiltered: n, vectorRanked: n, rerankInput: 0, rerankSurfaced: n },
    results: Array.from({ length: n }, (_, i) => ({
      daId: `da-${i + 1}`,
      score: 5 - i,
      why: "Matches your roofing query",
      confidence: 0,
      modelUsed: "embedding-only",
      candidate: {
        daId: `da-${i + 1}`,
        address: `${i + 1} Test St, Blacktown`,
        council: "Blacktown",
        estimatedValue: 500000,
        applicantName: "ACME Roofing",
        portalUrl: `https://portal.example/da-${i + 1}`,
        description: "Reroof of existing dwelling with Colorbond.",
        rawScopeText: null,
        lodgementDate: "2026-04-20",
        constructionCertifiedAt: null,
        approvalPathway: "cdc",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

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
  mockDb.digest.count.mockResolvedValue(0);
  mockDb.daFeedback.findMany.mockResolvedValue([]);
  mockDb.digestDa.create.mockResolvedValue({});
  mockDb.digest.update.mockResolvedValue({});
  sendEmailMock.mockResolvedValue(undefined);
  sendSmsMock.mockResolvedValue(true);
});

describe("assembleAndSendDigest — LLM-unavailable degraded digest still sends (issue #181)", () => {
  it("sends the digest with fallbackUsed persisted and daCount>0 (not unserved)", async () => {
    const result = await assembleAndSendDigest("user-1", "run-1", degradedRelevance(4));

    // The acceptance bar: sent, fallbackUsed, and real leads — not a failed row.
    expect(result.emailStatus).toBe("sent");
    expect(result.daCount).toBe(4);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    // fallbackUsed persisted on the Digest row so the portal banner + funnel agree.
    expect(mockDb.digest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fallbackUsed: true }) }),
    );

    // The distinct "basic mode" note flows to the email, not the cost-cap copy.
    const props = sendEmailMock.mock.calls[0][0].props;
    expect(props.fallbackUsed).toBe(true);
    expect(props.fallbackReason).toBe("llm_unavailable");
  });
});
