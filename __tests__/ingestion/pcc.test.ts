// Tests for the Online PCC Data API adapter + CC linkage (issue #13).
// - Pure mapping / CC-type filter (no mocks).
// - Paginated fetch with the network layer mocked.
// - DA linkage found + not-found against the real test Postgres (like
//   ingest.test.ts) so the (da_id, council) join + constructionCertifiedAt write
//   are exercised end-to-end.
// - runPccIngest no-op gate when the feed flag is off.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Mock the network layer so no live PCC API calls happen. NSW_PLANNING_API_KEY
// is seeded in __tests__/setup-env.ts so fetchCouncilPccs routes through this
// mock instead of short-circuiting to [].
vi.mock("@/modules/ingestion/fetch", () => ({
  fetchWithRetry: vi.fn(),
  politeDelay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { fetchWithRetry } from "@/modules/ingestion/fetch";
import {
  isConstructionCertificate,
  mapPccCertificate,
  fetchCouncilPccs,
} from "@/modules/ingestion/pcc";
import { linkCertificate, runPccIngest } from "@/modules/ingestion/pcc-ingest";
import { truncateAll, testDb } from "../setup-test-db";

const mockFetch = fetchWithRetry as unknown as ReturnType<typeof vi.fn>;

// A representative Construction Certificate from the PCC feed shape.
function cert(over: Record<string, unknown> = {}) {
  return {
    certificateNumber: "CC-2026/0421",
    certificateType: "Construction Certificate",
    relatedApplicationNumber: "DA-2025/1234",
    councilCode: "blacktown",
    issuedDate: "2026-06-15T00:00:00.000Z",
    url: "https://www.planningportal.nsw.gov.au/pcc/CC-2026-0421",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("isConstructionCertificate", () => {
  it("accepts the long label and the short code, case/space insensitive", () => {
    expect(isConstructionCertificate("Construction Certificate")).toBe(true);
    expect(isConstructionCertificate("  construction certificate ")).toBe(true);
    expect(isConstructionCertificate("CC")).toBe(true);
    expect(isConstructionCertificate("cc")).toBe(true);
  });

  it("rejects Occupation and Subdivision certificates (ignored in v1)", () => {
    expect(isConstructionCertificate("Occupation Certificate")).toBe(false);
    expect(isConstructionCertificate("OC")).toBe(false);
    expect(isConstructionCertificate("Subdivision Certificate")).toBe(false);
    expect(isConstructionCertificate("SC")).toBe(false);
  });

  it("rejects null/empty", () => {
    expect(isConstructionCertificate(null)).toBe(false);
    expect(isConstructionCertificate(undefined)).toBe(false);
    expect(isConstructionCertificate("")).toBe(false);
  });
});

describe("mapPccCertificate", () => {
  it("maps a Construction Certificate to a normalised record", () => {
    const rec = mapPccCertificate(cert() as never, "blacktown");
    expect(rec).toEqual({
      certificateNumber: "CC-2026/0421",
      relatedApplicationId: "DA-2025/1234",
      council: "blacktown",
      issuedDate: "2026-06-15", // sliced to yyyy-mm-dd
      portalUrl: "https://www.planningportal.nsw.gov.au/pcc/CC-2026-0421",
    });
  });

  it("returns null for an Occupation Certificate (OC ignored in v1)", () => {
    expect(
      mapPccCertificate(cert({ certificateType: "Occupation Certificate" }) as never, "blacktown"),
    ).toBeNull();
  });

  it("returns null when the related application reference is missing", () => {
    expect(
      mapPccCertificate(cert({ relatedApplicationNumber: "  " }) as never, "blacktown"),
    ).toBeNull();
  });

  it("returns null when the certificate number is missing", () => {
    expect(
      mapPccCertificate(cert({ certificateNumber: "" }) as never, "blacktown"),
    ).toBeNull();
  });
});

describe("fetchCouncilPccs", () => {
  it("filters to Construction Certificates only and normalises them", async () => {
    mockFetch.mockResolvedValueOnce({
      certificates: [
        cert({ certificateNumber: "CC-1", relatedApplicationNumber: "DA-1" }),
        cert({ certificateNumber: "OC-1", certificateType: "Occupation Certificate" }),
        cert({ certificateNumber: "CC-2", relatedApplicationNumber: "DA-2" }),
      ],
    });

    const records = await fetchCouncilPccs("blacktown", 1);
    expect(records.map((r) => r.certificateNumber)).toEqual(["CC-1", "CC-2"]);
    expect(records.every((r) => r.council === "blacktown")).toBe(true);
  });

  it("paginates until a partial page and dedupes by certificate number", async () => {
    // Full first page (200) then a short second page → stop after page 2.
    const fullPage = Array.from({ length: 200 }, (_, i) =>
      cert({ certificateNumber: `CC-${i}`, relatedApplicationNumber: `DA-${i}` }),
    );
    mockFetch
      .mockResolvedValueOnce({ certificates: fullPage })
      // Second page repeats CC-0 (boundary overlap) + one fresh CC.
      .mockResolvedValueOnce({
        certificates: [
          cert({ certificateNumber: "CC-0", relatedApplicationNumber: "DA-0" }),
          cert({ certificateNumber: "CC-200", relatedApplicationNumber: "DA-200" }),
        ],
      });

    const records = await fetchCouncilPccs("blacktown", 7);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // 200 unique from page 1 + 1 fresh from page 2 (CC-0 deduped).
    expect(records).toHaveLength(201);
    const numbers = records.map((r) => r.certificateNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("linkCertificate (real DB)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("links a CC to an existing DA and stamps constructionCertifiedAt", async () => {
    await testDb.developmentApplication.create({
      data: {
        daId: "DA-2025/1234",
        council: "blacktown",
        address: "12 Roof St, Blacktown",
        description: "New dwelling with Colorbond roof",
        lodgementDate: new Date("2025-11-01"),
        portalUrl: "https://portal/da/DA-2025-1234",
        sourceApi: "nsw_planning",
      },
    });

    const outcome = await linkCertificate({
      certificateNumber: "CC-2026/0421",
      relatedApplicationId: "DA-2025/1234",
      council: "blacktown",
      issuedDate: "2026-06-15",
      portalUrl: null,
    });

    expect(outcome).toBe("linked");
    const da = await testDb.developmentApplication.findFirst({
      where: { daId: "DA-2025/1234", council: "blacktown" },
    });
    expect(da?.constructionCertifiedAt?.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("returns 'unmatched' and creates nothing when no DA matches", async () => {
    const outcome = await linkCertificate({
      certificateNumber: "CC-9999",
      relatedApplicationId: "DA-DOES-NOT-EXIST",
      council: "blacktown",
      issuedDate: "2026-06-15",
      portalUrl: null,
    });

    expect(outcome).toBe("unmatched");
    const count = await testDb.developmentApplication.count();
    expect(count).toBe(0); // never inserts a bare CC as a DA
  });

  it("does not match a same-numbered application in a different council", async () => {
    await testDb.developmentApplication.create({
      data: {
        daId: "DA-2025/1234",
        council: "penrith", // same number, different council
        address: "5 Other St, Penrith",
        description: "Alterations and additions",
        lodgementDate: new Date("2025-11-01"),
        portalUrl: "https://portal/da/penrith",
        sourceApi: "nsw_planning",
      },
    });

    const outcome = await linkCertificate({
      certificateNumber: "CC-2026/0421",
      relatedApplicationId: "DA-2025/1234",
      council: "blacktown",
      issuedDate: "2026-06-15",
      portalUrl: null,
    });

    expect(outcome).toBe("unmatched");
    const da = await testDb.developmentApplication.findFirst({
      where: { daId: "DA-2025/1234", council: "penrith" },
    });
    expect(da?.constructionCertifiedAt).toBeNull();
  });
});

describe("runPccIngest gate", () => {
  it("no-ops when PCC_INGEST_ENABLED is off (default)", async () => {
    const result = await runPccIngest(1);
    expect(result.skipped).toBe(true);
    expect(result.fetched).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
