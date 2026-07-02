// Unit tests for the PlanSA (South Australia) jurisdiction adapter.
// Fixture-driven, no live network — the ArcGIS fetch layer is mocked. Runs in
// the always-on (no-DB, jsdom) fe suite; the adapter avoids `@/lib/env`.
//
// Covers: field mapping, council filtering, ArcGIS paging (full + partial last
// page), and the registry flag-off no-op.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/modules/ingestion/fetch", () => ({
  fetchWithRetry: vi.fn(),
  politeDelay: vi.fn().mockResolvedValue(undefined),
}));

import { fetchWithRetry } from "@/modules/ingestion/fetch";
import {
  saAdapter,
  mapFeatures,
  isAdelaideMetroCouncil,
  normaliseCouncil,
  toIsoDate,
  buildWhereClause,
  buildQueryUrl,
  type ArcgisQueryResponse,
  type PlanSaAttributes,
} from "./sa";
import { getEnabledJurisdictionIds, isFlagEnabled } from "./config";

const mockFetch = fetchWithRetry as unknown as ReturnType<typeof vi.fn>;

// A fixed incremental low-water mark for adapter/where-clause tests.
const SINCE = new Date("2026-06-01T00:00:00Z");

// A representative feature from the live FeatureServer shape. lodgementdate is
// ArcGIS epoch-ms (2026-06-15T00:00:00Z).
function feature(attrs: Partial<PlanSaAttributes>): { attributes: PlanSaAttributes } {
  return {
    attributes: {
      appid: "23001234",
      address: "10 King William St",
      suburb: "Adelaide",
      locationcouncil: "City of Adelaide",
      natureofdevelopment: "Re-roof of existing dwelling — Colorbond replacement",
      applicationstatus: "Lodged",
      devapprovalstatusname: "Under Assessment",
      lodgementdate: Date.UTC(2026, 5, 15),
      currentzone: "Capital City",
      assessmentpathway: "Code Assessed - Deemed to Satisfy",
      publicnotificationrequired: "No",
      ...attrs,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SA_INGEST_ENABLED;
});

describe("normaliseCouncil", () => {
  it("strips boilerplate and folds & → and", () => {
    expect(normaliseCouncil("City of Norwood Payneham & St Peters")).toBe(
      "norwood payneham and st peters",
    );
    expect(normaliseCouncil("Corporation of the Town of Walkerville")).toBe("walkerville");
    expect(normaliseCouncil("Campbelltown City Council")).toBe("campbelltown");
  });
});

describe("isAdelaideMetroCouncil", () => {
  it("accepts metro councils despite string drift", () => {
    expect(isAdelaideMetroCouncil("City of Adelaide")).toBe(true);
    expect(isAdelaideMetroCouncil("CHARLES STURT COUNCIL")).toBe(true);
    expect(isAdelaideMetroCouncil("City of Norwood, Payneham and St Peters")).toBe(true);
  });
  it("rejects regional councils and blanks", () => {
    expect(isAdelaideMetroCouncil("City of Mount Gambier")).toBe(false);
    expect(isAdelaideMetroCouncil("Wattle Range Council")).toBe(false);
    expect(isAdelaideMetroCouncil(null)).toBe(false);
    expect(isAdelaideMetroCouncil("")).toBe(false);
  });
});

describe("toIsoDate", () => {
  it("converts ArcGIS epoch-ms to yyyy-mm-dd (UTC)", () => {
    expect(toIsoDate(Date.UTC(2026, 5, 15))).toBe("2026-06-15");
  });
  it("accepts numeric strings and ISO strings", () => {
    expect(toIsoDate(String(Date.UTC(2026, 0, 2)))).toBe("2026-01-02");
    expect(toIsoDate("2026-03-04T09:30:00Z")).toBe("2026-03-04");
  });
  it("returns null for empty / unparseable", () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate("")).toBeNull();
    expect(toIsoDate("not-a-date")).toBeNull();
  });
});

describe("mapFeatures — field mapping", () => {
  it("maps ArcGIS attributes onto a normalised SA record", () => {
    const [rec] = mapFeatures([feature({})]);
    expect(rec).toMatchObject({
      daId: "23001234",
      council: "City of Adelaide",
      address: "10 King William St, Adelaide",
      description: "Re-roof of existing dwelling — Colorbond replacement",
      estimatedValue: null, // PlanSA has no cost-of-work field
      lodgementDate: "2026-06-15",
      determinationDate: null,
      applicantName: null,
      sourceApi: "plansa",
      jurisdiction: "sa",
      assessmentPathway: "Code Assessed - Deemed to Satisfy",
    });
    expect(rec!.portalUrl).toContain("appid=23001234");
    expect(rec!.rawScopeText).toBe("Re-roof of existing dwelling — Colorbond replacement");
  });

  it("drops features with no appid", () => {
    expect(mapFeatures([feature({ appid: null })])).toHaveLength(0);
    expect(mapFeatures([feature({ appid: "  " })])).toHaveLength(0);
  });

  it("carries a null assessmentPathway when absent", () => {
    const [rec] = mapFeatures([feature({ assessmentpathway: null })]);
    expect(rec!.assessmentPathway).toBeNull();
  });

  it("falls back to today's date when lodgementdate is missing", () => {
    const [rec] = mapFeatures([feature({ lodgementdate: null })]);
    expect(rec!.lodgementDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("mapFeatures — council filtering", () => {
  it("keeps metro councils and drops regional ones", () => {
    const records = mapFeatures([
      feature({ appid: "1", locationcouncil: "City of Adelaide" }),
      feature({ appid: "2", locationcouncil: "City of Charles Sturt" }),
      feature({ appid: "3", locationcouncil: "City of Mount Gambier" }), // regional → dropped
      feature({ appid: "4", locationcouncil: "Wattle Range Council" }), // regional → dropped
    ]);
    expect(records.map((r) => r.daId).sort()).toEqual(["1", "2"]);
  });
});

describe("buildWhereClause / buildQueryUrl", () => {
  it("filters incrementally on lodgementdate and by metro councils", () => {
    const where = buildWhereClause(SINCE);
    expect(where).toContain("lodgementdate >= DATE '2026-06-01'");
    expect(where).toContain("locationcouncil IN (");
    expect(where).toContain("'City of Adelaide'");
  });

  it("builds a standard paginated ArcGIS query URL", () => {
    const url = buildQueryUrl("1=1", 1000, 1000);
    expect(url).toContain("/FeatureServer/1/query?");
    expect(url).toContain("f=json");
    expect(url).toContain("outFields=*");
    expect(url).toContain("resultOffset=1000");
    expect(url).toContain("resultRecordCount=1000");
  });
});

describe("saAdapter.fetchApplications — paging", () => {
  it("paginates a full page then stops on a partial last page", async () => {
    const pageSize = 2;
    // Page 0: full (== pageSize) + exceededTransferLimit → fetch again.
    const page0: ArcgisQueryResponse = {
      features: [feature({ appid: "1" }), feature({ appid: "2" })],
      exceededTransferLimit: true,
    };
    // Page 1: partial (< pageSize), no exceededTransferLimit → stop.
    const page1: ArcgisQueryResponse = {
      features: [feature({ appid: "3" })],
    };
    mockFetch.mockResolvedValueOnce(page0).mockResolvedValueOnce(page1);

    const records = await saAdapter.fetchApplications({ since: SINCE, regions: [], pageSize, maxPages: 10 });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(records.map((r) => r.daId)).toEqual(["1", "2", "3"]);
    // Offsets advance by pageSize across pages.
    expect(mockFetch.mock.calls[0]![0]).toContain("resultOffset=0");
    expect(mockFetch.mock.calls[1]![0]).toContain(`resultOffset=${pageSize}`);
  });

  it("stops after a single partial page (no second request)", async () => {
    mockFetch.mockResolvedValueOnce({ features: [feature({ appid: "1" })] } as ArcgisQueryResponse);
    const records = await saAdapter.fetchApplications({ since: SINCE, regions: [], pageSize: 10 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
  });

  it("stops on an empty first page", async () => {
    mockFetch.mockResolvedValueOnce({ features: [] } as ArcgisQueryResponse);
    const records = await saAdapter.fetchApplications({ since: SINCE, regions: [], pageSize: 10 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(0);
  });
});

describe("saAdapter — formal interface", () => {
  it("declares its id and capabilities (no value, pathways supported)", () => {
    expect(saAdapter.id).toBe("sa");
    expect(saAdapter.capabilities).toEqual({ hasValue: false, pathwaysSupported: true });
  });
});

describe("registry — flag gating (dormant by default)", () => {
  it("enables only NSW when the SA flag is unset (byte-identical no-op)", () => {
    expect(isFlagEnabled("SA_INGEST_ENABLED")).toBe(false);
    expect(getEnabledJurisdictionIds()).toEqual(["nsw"]);
  });

  it("includes SA only when SA_INGEST_ENABLED is truthy", () => {
    process.env.SA_INGEST_ENABLED = "true";
    expect(getEnabledJurisdictionIds()).toEqual(["nsw", "sa"]);
  });

  it("treats non-strict values (e.g. 'false') as off", () => {
    process.env.SA_INGEST_ENABLED = "false";
    expect(getEnabledJurisdictionIds()).toEqual(["nsw"]);
  });
});
