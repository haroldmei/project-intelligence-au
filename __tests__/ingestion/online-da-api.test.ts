// Tests for the NSW ePlanning Online DA Data API adapter (issue #9).
// - Pure field mapping (no mocks).
// - Paginated / incremental fetch with the network layer mocked.
// - LGA filtering to our 15 subscribed councils + the no-key no-op.
// - Reuse of the DAEX freshness / stale-Determined filters.
//
// `@/lib/env` is mocked here (not the setup-env.ts seed) so the no-key branch
// can be exercised by toggling `env.NSW_PLANNING_API_KEY` at call time — the
// adapter reads it as a property access on each call.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/modules/ingestion/fetch", () => ({
  fetchWithRetry: vi.fn(),
  fetchTextWithRetry: vi.fn(),
  politeDelay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/env", () => ({
  env: {
    NSW_PLANNING_API_BASE: "https://api.test.gov.au/eplanning/data/v0",
    NSW_PLANNING_API_KEY: "test-nsw-key",
    DAEX_INGEST_ENABLED: false,
    SSD_INGEST_ENABLED: false,
  },
}));

import { fetchWithRetry } from "@/modules/ingestion/fetch";
import { env } from "@/lib/env";
import {
  mapNswPlanningApplication,
  fetchNswPlanningDAs,
} from "@/modules/ingestion/sources";

const mockFetch = fetchWithRetry as unknown as ReturnType<typeof vi.fn>;

// A representative record from the Online DA Data API shape.
function da(over: Record<string, unknown> = {}) {
  return {
    applicationNumber: "PAN-2026001",
    councilCode: "Blacktown City Council",
    address: "12 Gable Ave, Blacktown NSW 2148",
    proposedDevelopment: "New dwelling with Colorbond metal roof",
    estimatedCost: 640000,
    lodgedDate: "2026-06-20T00:00:00.000Z",
    applicant: "J. Smith",
    url: "https://www.planningportal.nsw.gov.au/da/PAN-2026001",
    scopeDescription: "Two-storey dwelling, metal deck roofing",
    developmentType: "Residential - single new dwelling",
    ...over,
  };
}

/** A yyyy-mm-dd date `days` before now, robust to the wall clock under test. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.clearAllMocks();
  env.NSW_PLANNING_API_KEY = "test-nsw-key";
});

describe("mapNswPlanningApplication", () => {
  it("maps an Online DA Data API record to a normalised DA record", () => {
    const rec = mapNswPlanningApplication(da() as never, "blacktown");
    expect(rec).toMatchObject({
      daId: "PAN-2026001",
      council: "blacktown", // our slug, not the API's council name
      address: "12 Gable Ave, Blacktown NSW 2148",
      description: "New dwelling with Colorbond metal roof",
      estimatedValue: 640000,
      lodgementDate: "2026-06-20", // sliced to yyyy-mm-dd
      determinationDate: null, // undetermined DA
      applicantName: "J. Smith",
      portalUrl: "https://www.planningportal.nsw.gov.au/da/PAN-2026001",
      developmentType: "Residential - single new dwelling",
      sourceApi: "nsw_planning",
      approvalPathway: "da",
    });
  });

  it("persists the categorical development type (#26) and folds it into rawScopeText", () => {
    const rec = mapNswPlanningApplication(da() as never, "blacktown");
    expect(rec?.developmentType).toBe("Residential - single new dwelling");
    expect(rec?.rawScopeText).toContain("Residential - single new dwelling");
    expect(rec?.rawScopeText).toContain("metal deck roofing");
  });

  it("maps the determination date when the DA is determined", () => {
    const rec = mapNswPlanningApplication(
      da({ determinedDate: "2026-06-01T00:00:00.000Z", decision: "Approved" }) as never,
      "blacktown",
    );
    expect(rec?.determinationDate).toBe("2026-06-01");
  });

  it("returns null when the application number is missing", () => {
    expect(mapNswPlanningApplication(da({ applicationNumber: "  " }) as never, "blacktown")).toBeNull();
  });
});

describe("fetchNswPlanningDAs — auth, LGA filter, incremental fetch", () => {
  it("no-ops (no fetch) when the API key is unset", async () => {
    env.NSW_PLANNING_API_KEY = undefined;
    const records = await fetchNswPlanningDAs("blacktown", 7);
    expect(records).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no-ops (no fetch) for a council outside our 15 subscribed LGAs", async () => {
    // liverpool is a real NSW LGA but not one we sell into.
    const records = await fetchNswPlanningDAs("liverpool", 7);
    expect(records).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("queries by the subscribed LGA's council name with an incremental modifiedSince", async () => {
    mockFetch.mockResolvedValueOnce({ applications: [] });
    await fetchNswPlanningDAs("blacktown", 7);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain(encodeURIComponent("Blacktown City Council"));
    expect(url).toContain("modifiedSince=");
    expect(url).toContain("page=0");
  });

  it("normalises records for a council", async () => {
    mockFetch.mockResolvedValueOnce({
      applications: [da({ applicationNumber: "PAN-1" }), da({ applicationNumber: "PAN-2" })],
    });
    const records = await fetchNswPlanningDAs("penrith", 1);
    expect(records.map((r) => r.daId)).toEqual(["PAN-1", "PAN-2"]);
    expect(records.every((r) => r.council === "penrith")).toBe(true);
    expect(records.every((r) => r.sourceApi === "nsw_planning")).toBe(true);
    expect(records.every((r) => r.approvalPathway === "da")).toBe(true);
  });

  it("paginates until a partial page and dedupes by daId across boundaries", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => da({ applicationNumber: `PAN-${i}` }));
    mockFetch
      .mockResolvedValueOnce({ applications: fullPage })
      // Second page repeats PAN-0 (boundary overlap) + one fresh record.
      .mockResolvedValueOnce({
        applications: [da({ applicationNumber: "PAN-0" }), da({ applicationNumber: "PAN-200" })],
      });

    const records = await fetchNswPlanningDAs("blacktown", 7);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(201); // 200 unique + 1 fresh (PAN-0 deduped)
    const ids = records.map((r) => r.daId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stops after an empty first page", async () => {
    mockFetch.mockResolvedValueOnce({ applications: [] });
    const records = await fetchNswPlanningDAs("bayside", 1);
    expect(records).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("skips unmappable records (missing application number) but keeps the rest", async () => {
    mockFetch.mockResolvedValueOnce({
      applications: [da({ applicationNumber: "PAN-1" }), da({ applicationNumber: "" })],
    });
    const records = await fetchNswPlanningDAs("blacktown", 1);
    expect(records.map((r) => r.daId)).toEqual(["PAN-1"]);
  });
});

describe("fetchNswPlanningDAs — freshness / stale-Determined filter reuse", () => {
  it("keeps a recent, approved determination", async () => {
    mockFetch.mockResolvedValueOnce({
      applications: [da({ applicationNumber: "PAN-OK", determinedDate: daysAgo(30), decision: "Approved" })],
    });
    const records = await fetchNswPlanningDAs("blacktown", 90);
    expect(records.map((r) => r.daId)).toEqual(["PAN-OK"]);
  });

  it("drops a refused determination (dead lead)", async () => {
    mockFetch.mockResolvedValueOnce({
      applications: [da({ applicationNumber: "PAN-NO", determinedDate: daysAgo(10), decision: "Refused" })],
    });
    const records = await fetchNswPlanningDAs("blacktown", 90);
    expect(records).toEqual([]);
  });

  it("drops a determination older than the freshness window", async () => {
    mockFetch.mockResolvedValueOnce({
      applications: [da({ applicationNumber: "PAN-OLD", determinedDate: daysAgo(400), decision: "Approved" })],
    });
    const records = await fetchNswPlanningDAs("blacktown", 500);
    expect(records).toEqual([]);
  });

  it("keeps an undetermined (in-flight) DA regardless of lodgement age", async () => {
    mockFetch.mockResolvedValueOnce({
      applications: [da({ applicationNumber: "PAN-LIVE", lodgedDate: daysAgo(400) })],
    });
    const records = await fetchNswPlanningDAs("blacktown", 500);
    expect(records.map((r) => r.daId)).toEqual(["PAN-LIVE"]);
  });
});
