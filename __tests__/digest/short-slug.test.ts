// Issue #53: shortSlug() used to return `Buffer.from(url).toString('base64url')
// .slice(0,8)`, i.e. the base64 of the URL's first ~6 bytes — which is the
// scheme ("https:") for every council portal URL. So every https DA collapsed
// to the slug 'aHR0cHM6', the per-card ShortUrl upsert overwrote one shared
// row, and all three SMS links in a digest redirected to whichever DA was
// upserted last (FR-011/FR-012 violation: link must point to THAT DA's page).
//
// The fix hashes the URL. These tests pin injectivity over distinct portal
// URLs and prove two DAs in one digest run produce two distinct ShortUrl rows.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, sendSmsMock, sendEmailMock } = vi.hoisted(() => ({
  mockDb: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    digest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    digestDa: { create: vi.fn() },
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

import { assembleAndSendDigest, shortSlug } from "@/modules/digest/assemble";

describe("shortSlug — injective over distinct portal URLs (issue #53)", () => {
  it("does NOT collapse two https council URLs to the same slug", () => {
    const a = shortSlug("https://council-a.nsw.gov.au/da/111");
    const b = shortSlug("https://council-b.nsw.gov.au/da/999");
    expect(a).not.toEqual(b);
    // Regression guard: the old prefix implementation returned this for both.
    expect(a).not.toBe("aHR0cHM6");
    expect(b).not.toBe("aHR0cHM6");
  });

  it("distinguishes URLs that share a long common prefix (same host + path stem)", () => {
    const a = shortSlug("https://eplanning.nsw.gov.au/portal/da/2026-0001");
    const b = shortSlug("https://eplanning.nsw.gov.au/portal/da/2026-0002");
    expect(a).not.toEqual(b);
  });

  it("is deterministic — same URL always yields the same slug", () => {
    const url = "https://portal.example/da-42";
    expect(shortSlug(url)).toBe(shortSlug(url));
  });

  it("is collision-free across a large set of realistic portal URLs", () => {
    const slugs = new Set<string>();
    const urls: string[] = [];
    for (let i = 0; i < 2000; i++) {
      urls.push(`https://eplanning.nsw.gov.au/portal/da/2026-${i.toString().padStart(5, "0")}`);
    }
    for (const u of urls) slugs.add(shortSlug(u));
    expect(slugs.size).toBe(urls.length);
  });

  it("emits URL-safe slugs (base64url alphabet only, no + / =)", () => {
    for (let i = 0; i < 200; i++) {
      const slug = shortSlug(`https://council.nsw.gov.au/da/${i}?ref=sms&x=${i * 7}`);
      expect(slug).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

const SNAPSHOT = {
  id: "user-1",
  email: "tradie@example.com",
  smsOptIn: true,
  emailOptIn: true,
  mobile_e164: "+61400000001",
  lgaBundles: [{ bundle: { label: "Western Sydney" } }],
};

function makeRelevance(portalUrls: string[]) {
  return {
    fallbackUsed: false,
    stats: {
      ruleFiltered: portalUrls.length,
      vectorRanked: portalUrls.length,
      rerankInput: portalUrls.length,
      rerankSurfaced: portalUrls.length,
    },
    results: portalUrls.map((portalUrl, i) => ({
      daId: `da-${i + 1}`,
      score: 2.5,
      why: `metal reroof #${i + 1}`,
      candidate: {
        address: `${i + 1} Test St, Blacktown`,
        council: "Blacktown",
        estimatedValue: 500000,
        applicantName: "ACME Roofing",
        portalUrl,
        description: "Reroof of existing dwelling with Colorbond.",
      },
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("assembleAndSendDigest — one ShortUrl row per DA (issue #53)", () => {
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
    mockDb.digestDa.create.mockResolvedValue({});
    mockDb.shortUrl.upsert.mockResolvedValue({});
    mockDb.digest.update.mockResolvedValue({});
    sendEmailMock.mockResolvedValue(undefined);
    sendSmsMock.mockResolvedValue(true);
  });

  it("upserts a distinct slug → correct targetUrl for each DA in one run", async () => {
    const portalUrls = [
      "https://council-a.nsw.gov.au/da/111",
      "https://council-b.nsw.gov.au/da/999",
      "https://council-c.nsw.gov.au/da/555",
    ];
    await assembleAndSendDigest("user-1", "run-1", makeRelevance(portalUrls));

    // One upsert per top-3 SMS card.
    expect(mockDb.shortUrl.upsert).toHaveBeenCalledTimes(portalUrls.length);

    // Each slug is distinct AND maps to that DA's own portalUrl — no shared row.
    const slugs = new Set<string>();
    for (const call of mockDb.shortUrl.upsert.mock.calls) {
      const { where, create } = call[0];
      slugs.add(where.slug);
      expect(create.slug).toBe(where.slug);
      // The slug written for this URL must be exactly what the redirect handler
      // will look up for the same URL — i.e. what shortSlug produces.
      expect(where.slug).toBe(shortSlug(create.targetUrl));
      expect(portalUrls).toContain(create.targetUrl);
    }
    expect(slugs.size).toBe(portalUrls.length);
  });
});
