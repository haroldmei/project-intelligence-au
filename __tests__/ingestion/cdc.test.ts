// Tests for the Online CDC Data API adapter (issue #10).
// - Pure mapping / daId namespacing (no mocks).
// - Paginated fetch with the network layer mocked.
// - CDC records persist through the shared upsert path with approval_pathway='cdc'
//   against the real test Postgres (like ingest.test.ts).
// - isCdcIngestEnabled default-on + explicit-off semantics.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Mock the network layer so no live CDC API calls happen. NSW_PLANNING_API_KEY is
// seeded in __tests__/setup-env.ts so fetchCouncilCdcs routes through this mock
// instead of short-circuiting to [].
vi.mock("@/modules/ingestion/fetch", () => ({
  fetchWithRetry: vi.fn(),
  fetchTextWithRetry: vi.fn(),
  politeDelay: vi.fn().mockResolvedValue(undefined),
}));

import { fetchWithRetry } from "@/modules/ingestion/fetch";
import {
  isCdcIngestEnabled,
  isCdcActive,
  namespaceCdcDaId,
  mapCdcApplication,
  fetchCouncilCdcs,
} from "@/modules/ingestion/cdc";
import { upsertDa } from "@/modules/ingestion/ingest";
import type { NormalisedApplication } from "@/modules/ingestion/jurisdictions/types";
import { truncateAll, testDb } from "../setup-test-db";

const mockFetch = fetchWithRetry as unknown as ReturnType<typeof vi.fn>;

// A representative CDC application from the Online CDC Data API shape (mirrors the
// Online DA Data API record).
function cdc(over: Record<string, unknown> = {}) {
  return {
    applicationNumber: "2026/0421",
    councilCode: "blacktown",
    address: "12 Ridge St, Blacktown NSW 2148",
    proposedDevelopment: "Replacement roof cladding — tile to Colorbond metal deck",
    estimatedCost: 42000,
    lodgedDate: "2026-06-15T00:00:00.000Z",
    applicant: "Sydney Roofing Co",
    url: "https://www.planningportal.nsw.gov.au/cdc/2026-0421",
    scopeDescription: "Remove existing concrete roof tiles and re-sheet with Colorbond metal deck",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CDC_INGEST_ENABLED;
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("isCdcIngestEnabled — default-on flag", () => {
  it("defaults ON when unset", () => {
    delete process.env.CDC_INGEST_ENABLED;
    expect(isCdcIngestEnabled()).toBe(true);
  });

  it("stays on for any value other than an explicit off", () => {
    process.env.CDC_INGEST_ENABLED = "true";
    expect(isCdcIngestEnabled()).toBe(true);
    process.env.CDC_INGEST_ENABLED = "1";
    expect(isCdcIngestEnabled()).toBe(true);
  });

  it("turns off only for an explicit 'false'/'0'", () => {
    process.env.CDC_INGEST_ENABLED = "false";
    expect(isCdcIngestEnabled()).toBe(false);
    process.env.CDC_INGEST_ENABLED = "0";
    expect(isCdcIngestEnabled()).toBe(false);
  });
});

describe("isCdcActive — flag AND shared API key both required", () => {
  // `env.NSW_PLANNING_API_KEY` is the frozen `@/lib/env` snapshot (parsed once
  // at module load, per src/lib/env.ts), unlike `isCdcIngestEnabled`'s raw
  // `process.env` read — so the "key absent" branch can't be exercised by
  // toggling process.env mid-test-file. It's the same `env.NSW_PLANNING_API_KEY`
  // check `fetchCouncilDAs`/`fetchCouncilCdcs` already gate on (sources.ts,
  // cdc.ts), so it's covered by those call sites.
  it("is true when the flag defaults on and the key is present (seeded by setup-env.ts)", () => {
    expect(isCdcActive()).toBe(true);
  });

  it("is false when the flag is explicitly off, even with the key present", () => {
    process.env.CDC_INGEST_ENABLED = "false";
    expect(isCdcActive()).toBe(false);
  });
});

describe("namespaceCdcDaId", () => {
  it("prefixes a bare council reference so it can't collide with a DA", () => {
    expect(namespaceCdcDaId("2026/0421")).toBe("CDC-2026/0421");
  });

  it("leaves an already-CDC-marked reference untouched (idempotent)", () => {
    expect(namespaceCdcDaId("CDC-2026/0421")).toBe("CDC-2026/0421");
    expect(namespaceCdcDaId("cdc/2026/9")).toBe("cdc/2026/9");
  });

  it("trims surrounding whitespace before prefixing", () => {
    expect(namespaceCdcDaId("  2026/1  ")).toBe("CDC-2026/1");
  });
});

describe("mapCdcApplication", () => {
  it("maps a CDC application to a normalised DA record with pathway=cdc", () => {
    const rec = mapCdcApplication(cdc() as never, "blacktown");
    expect(rec).toMatchObject({
      daId: "CDC-2026/0421", // namespaced so it never collides with a DA
      council: "blacktown",
      address: "12 Ridge St, Blacktown NSW 2148",
      description: "Replacement roof cladding — tile to Colorbond metal deck",
      estimatedValue: 42000,
      lodgementDate: "2026-06-15", // sliced to yyyy-mm-dd
      applicantName: "Sydney Roofing Co",
      sourceApi: "nsw_cdc",
      approvalPathway: "cdc",
      developmentType: null,
    });
  });

  it("folds the 'Complying Development Certificate' marker into rawScopeText", () => {
    const rec = mapCdcApplication(cdc() as never, "blacktown");
    expect(rec?.rawScopeText).toContain("Complying Development Certificate");
    expect(rec?.rawScopeText).toContain("re-sheet with Colorbond");
  });

  it("returns null when the application number is missing", () => {
    expect(mapCdcApplication(cdc({ applicationNumber: "  " }) as never, "blacktown")).toBeNull();
  });

  it("returns null when the address is missing", () => {
    expect(mapCdcApplication(cdc({ address: "" }) as never, "blacktown")).toBeNull();
  });
});

describe("fetchCouncilCdcs", () => {
  it("normalises CDC applications for a council", async () => {
    mockFetch.mockResolvedValueOnce({
      applications: [cdc({ applicationNumber: "A-1" }), cdc({ applicationNumber: "A-2" })],
    });

    const records = await fetchCouncilCdcs("blacktown", 1);
    expect(records.map((r) => r.daId)).toEqual(["CDC-A-1", "CDC-A-2"]);
    expect(records.every((r) => r.approvalPathway === "cdc")).toBe(true);
    expect(records.every((r) => r.sourceApi === "nsw_cdc")).toBe(true);
    expect(records.every((r) => r.council === "blacktown")).toBe(true);
  });

  it("paginates until a partial page and dedupes by namespaced daId", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => cdc({ applicationNumber: `A-${i}` }));
    mockFetch
      .mockResolvedValueOnce({ applications: fullPage })
      // Second page repeats A-0 (boundary overlap) + one fresh record.
      .mockResolvedValueOnce({
        applications: [cdc({ applicationNumber: "A-0" }), cdc({ applicationNumber: "A-200" })],
      });

    const records = await fetchCouncilCdcs("blacktown", 7);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(201); // 200 unique + 1 fresh (A-0 deduped)
    const ids = records.map((r) => r.daId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns [] and stops after an empty first page", async () => {
    mockFetch.mockResolvedValueOnce({ applications: [] });
    const records = await fetchCouncilCdcs("blacktown", 1);
    expect(records).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("skips unmappable records (missing address) but keeps the rest", async () => {
    mockFetch.mockResolvedValueOnce({
      applications: [cdc({ applicationNumber: "A-1" }), cdc({ applicationNumber: "A-2", address: "" })],
    });
    const records = await fetchCouncilCdcs("blacktown", 1);
    expect(records.map((r) => r.daId)).toEqual(["CDC-A-1"]);
  });
});

describe("CDC persistence through the shared upsert path (real DB)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  function cdcRecord(over: Partial<NormalisedApplication> = {}): NormalisedApplication {
    return {
      daId: "CDC-2026/0421",
      council: "blacktown",
      jurisdiction: "nsw",
      address: "12 Ridge St, Blacktown",
      description: "Replacement roof cladding — tile to Colorbond metal deck",
      estimatedValue: 42000,
      lodgementDate: "2026-06-15",
      determinationDate: null,
      developmentType: null,
      applicantName: "Sydney Roofing Co",
      portalUrl: "https://portal/cdc/2026-0421",
      rawScopeText: "Complying Development Certificate. Re-sheet with Colorbond.",
      assessmentPathway: null,
      sourceApi: "nsw_cdc",
      approvalPathway: "cdc",
      ...over,
    };
  }

  it("persists a CDC record with approval_pathway='cdc'", async () => {
    await upsertDa(cdcRecord());
    const da = await testDb.developmentApplication.findFirst({
      where: { daId: "CDC-2026/0421", council: "blacktown" },
    });
    expect(da).not.toBeNull();
    expect(da?.approvalPathway).toBe("cdc");
    expect(da?.sourceApi).toBe("nsw_cdc");
  });

  it("a namespaced CDC id never collides with a DA of the same council reference", async () => {
    // A DA and a CDC can share the council-issued number "2026/0421"; the CDC's
    // namespaced daId keeps them as two distinct rows in the same council.
    await upsertDa({
      daId: "2026/0421",
      council: "blacktown",
      jurisdiction: "nsw",
      address: "99 Other St, Blacktown",
      description: "New dwelling",
      estimatedValue: null,
      lodgementDate: "2026-06-01",
      determinationDate: null,
      developmentType: null,
      applicantName: null,
      portalUrl: "https://portal/da/2026-0421",
      rawScopeText: null,
      assessmentPathway: null,
      sourceApi: "nsw_planning",
      approvalPathway: "da",
    });
    await upsertDa(cdcRecord());

    const rows = await testDb.developmentApplication.findMany({
      where: { council: "blacktown" },
      orderBy: { daId: "asc" },
    });
    expect(rows.map((r) => `${r.daId}:${r.approvalPathway}`)).toEqual([
      "2026/0421:da",
      "CDC-2026/0421:cdc",
    ]);
  });
});
