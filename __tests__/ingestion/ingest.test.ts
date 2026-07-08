// Integration tests for src/modules/ingestion/
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// Vitest + real Postgres test DB (TEST_DATABASE_URL)
// Hard-fail: 80% line coverage on exported functions (NFR-024)
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Mock external fetch to avoid live API calls during tests. NSW_PLANNING_API_KEY
// is seeded in __tests__/setup-env.ts so the dispatcher routes through these
// mocks instead of short-circuiting to [].
vi.mock("@/modules/ingestion/fetch", () => ({
  fetchWithRetry: vi.fn(),
  fetchTextWithRetry: vi.fn(),
  politeDelay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { fetchWithRetry } from "@/modules/ingestion/fetch";
import { truncateAll, seedLgaBundles, testDb } from "../setup-test-db";
import { runIngest, upsertDa } from "@/modules/ingestion/ingest";
import type { NormalisedApplication } from "@/modules/ingestion/jurisdictions/types";

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
  vi.clearAllMocks();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("runIngest", () => {
  it("upserts DA records into development_applications", async () => {
    const mockDA = {
      applications: [
        {
          applicationNumber: "DA-001",
          councilCode: "blacktown",
          address: "12 Roof St Blacktown",
          proposedDevelopment: "Re-roof existing dwelling with Colorbond",
          estimatedCost: 15000,
          lodgedDate: new Date().toISOString(),
          applicant: "John Smith",
          url: "https://planningportal.nsw.gov.au/DA-001",
          scopeDescription: "Replace existing tile roof with metal Colorbond",
        },
      ],
    };
    (fetchWithRetry as ReturnType<typeof vi.fn>).mockResolvedValue(mockDA);

    // Only run blacktown (first council) to keep test fast
    const result = await runIngest(1);

    expect(result.totalIngested).toBeGreaterThan(0);
    const da = await testDb.developmentApplication.findFirst({
      where: { council: "blacktown" },
    });
    expect(da).not.toBeNull();
    expect(da?.description).toContain("Colorbond");
  });

  it("stamps jurisdiction='nsw' on upserted NSW records (#28)", async () => {
    const mockDA = {
      applications: [
        {
          applicationNumber: "DA-JUR-1",
          councilCode: "blacktown",
          address: "9 Ridge Ave Blacktown",
          proposedDevelopment: "New dwelling with metal roof",
          estimatedCost: 20000,
          lodgedDate: new Date().toISOString(),
          applicant: null,
          url: "https://planningportal.nsw.gov.au/DA-JUR-1",
          scopeDescription: "Colorbond roof to new single-storey dwelling",
        },
      ],
    };
    (fetchWithRetry as ReturnType<typeof vi.fn>).mockResolvedValue(mockDA);

    await runIngest(1);

    const da = await testDb.developmentApplication.findFirst({
      where: { council: "blacktown", daId: "DA-JUR-1" },
    });
    expect(da).not.toBeNull();
    // The multi-jurisdiction seam: every NSW record carries the default
    // jurisdiction, so downstream jurisdiction-scoped queries work while NSW
    // output stays byte-identical.
    expect(da?.jurisdiction).toBe("nsw");
  });

  it("records ingestion_log on success", async () => {
    (fetchWithRetry as ReturnType<typeof vi.fn>).mockResolvedValue({ applications: [] });
    await runIngest(1);
    const logs = await testDb.ingestionLog.findMany({ where: { success: true } });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("records ingestion_log on failure", async () => {
    (fetchWithRetry as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));
    const result = await runIngest(1);
    expect(result.totalFailed).toBeGreaterThan(0);
    const failLogs = await testDb.ingestionLog.findMany({ where: { success: false } });
    expect(failLogs.length).toBeGreaterThan(0);
  });

  it("upserts on duplicate da_id+council (idempotent)", async () => {
    const mockDA = {
      applications: [
        {
          applicationNumber: "DA-DUP",
          councilCode: "blacktown",
          address: "1 Main St",
          proposedDevelopment: "Roofing works",
          estimatedCost: null,
          lodgedDate: new Date().toISOString(),
          applicant: null,
          url: "https://example.com/da-dup",
          scopeDescription: null,
        },
      ],
    };
    (fetchWithRetry as ReturnType<typeof vi.fn>).mockResolvedValue(mockDA);

    await runIngest(1);
    const countAfterFirstRun = await testDb.developmentApplication.count({ where: { daId: "DA-DUP" } });
    expect(countAfterFirstRun).toBeGreaterThan(0);

    await runIngest(1);
    const countAfterSecondRun = await testDb.developmentApplication.count({ where: { daId: "DA-DUP" } });

    // Idempotency: re-ingesting the same DA doesn't create new rows.
    // Each row is keyed on (daId, council); the mock returns the same DA for
    // every council the dispatcher routes to, so countAfterFirstRun depends
    // on how many councils match the configured adapter — but it MUST equal
    // countAfterSecondRun for upsert idempotency.
    expect(countAfterSecondRun).toBe(countAfterFirstRun);
  });
});

describe("development-type persistence (#26)", () => {
  function normalised(overrides: Partial<NormalisedApplication>): NormalisedApplication {
    return {
      daId: "DA-DT-1",
      council: "blacktown",
      jurisdiction: "nsw",
      address: "1 Category St",
      description: "Demolition of existing dwelling",
      estimatedValue: null,
      lodgementDate: "2026-07-01",
      determinationDate: null,
      developmentType: "Demolition",
      applicantName: null,
      portalUrl: "https://example.com/da-dt-1",
      rawScopeText: "Full demolition. Site to be left clear.",
      assessmentPathway: null,
      sourceApi: "da_exhibitions",
      approvalPathway: "da",
      ...overrides,
    };
  }

  it("round-trips a persisted development_type through the new column", async () => {
    await upsertDa(normalised({ daId: "DA-DT-1", developmentType: "Demolition" }));
    const da = await testDb.developmentApplication.findFirst({
      where: { daId: "DA-DT-1", council: "blacktown" },
    });
    expect(da?.developmentType).toBe("Demolition");
  });

  it("persists null for feeds that expose no category", async () => {
    await upsertDa(normalised({ daId: "DA-DT-2", developmentType: null }));
    const da = await testDb.developmentApplication.findFirst({
      where: { daId: "DA-DT-2", council: "blacktown" },
    });
    expect(da).not.toBeNull();
    expect(da?.developmentType).toBeNull();
  });

  it("updates the category on re-ingest of the same DA", async () => {
    await upsertDa(normalised({ daId: "DA-DT-3", developmentType: null }));
    await upsertDa(normalised({ daId: "DA-DT-3", developmentType: "Swimming Pool" }));
    const da = await testDb.developmentApplication.findFirst({
      where: { daId: "DA-DT-3", council: "blacktown" },
    });
    expect(da?.developmentType).toBe("Swimming Pool");
  });
});

describe("drift detection", () => {
  it("fires Sentry alert when today count is 0 and history exists", async () => {
    const { captureMessage } = await import("@sentry/nextjs");

    // Seed a historical log entry (success, daCount > 0). No approvalPathway →
    // defaults 'da', the pathway the empty run's DA baseline is checked against.
    await testDb.ingestionLog.create({
      data: { council: "blacktown", sourceApi: "nsw_planning", daCount: 10, success: true },
    });

    // Mock fetch returning 0 results
    (fetchWithRetry as ReturnType<typeof vi.fn>).mockResolvedValue({ applications: [] });
    await runIngest(1);

    // FR-003: alert must carry source API name and last success timestamp.
    expect(captureMessage).toHaveBeenCalled();
    const calls = (captureMessage as ReturnType<typeof vi.fn>).mock.calls;
    const driftCall = calls.find(
      (call: unknown[]) =>
        (call[1] as { tags?: { phase?: string } } | undefined)?.tags?.phase === "ingestion-drift",
    );
    expect(driftCall).toBeDefined();

    const tags = (driftCall as [string, { tags: Record<string, string> }])[1].tags;
    expect(tags.source_api).toBe("nsw_planning");
    expect(tags.last_success_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // Message should include both values.
    const msg = (driftCall as [string])[0];
    expect(msg).toContain("source_api=nsw_planning");
    expect(msg).toContain("last_success_at=");
  });
});

describe("CDC ingestion through runIngest (#10)", () => {
  // Route the shared network mock by endpoint so the DA feed and the CDC feed
  // return their own shapes. Both share the ePlanning subscription key; CDC is
  // additive to whichever DA source ran.
  function routeByEndpoint() {
    (fetchWithRetry as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("complying-development-certificates")) {
        return Promise.resolve({
          applications: [
            {
              applicationNumber: "2026/9001",
              councilCode: "blacktown",
              address: "7 Ridge St, Blacktown",
              proposedDevelopment: "Replacement roof cladding — tile to Colorbond metal deck",
              estimatedCost: 38000,
              lodgedDate: new Date().toISOString(),
              applicant: "Roofer Pty Ltd",
              url: "https://planningportal.nsw.gov.au/cdc/2026-9001",
              scopeDescription: "Re-sheet existing roof, tile→metal conversion",
            },
          ],
        });
      }
      // DA (Online DA Data API) endpoint.
      return Promise.resolve({
        applications: [
          {
            applicationNumber: "DA-5001",
            councilCode: "blacktown",
            address: "3 Gable Ave, Blacktown",
            proposedDevelopment: "Alterations and additions to dwelling",
            estimatedCost: 120000,
            lodgedDate: new Date().toISOString(),
            applicant: null,
            url: "https://planningportal.nsw.gov.au/DA-5001",
            scopeDescription: "New roof over rear extension",
          },
        ],
      });
    });
  }

  it("persists CDC records with approval_pathway='cdc' alongside DA records", async () => {
    routeByEndpoint();
    await runIngest(1);

    const cdc = await testDb.developmentApplication.findFirst({
      where: { council: "blacktown", approvalPathway: "cdc" },
    });
    expect(cdc).not.toBeNull();
    expect(cdc?.daId).toBe("CDC-2026/9001"); // namespaced
    expect(cdc?.sourceApi).toBe("nsw_cdc");

    const da = await testDb.developmentApplication.findFirst({
      where: { council: "blacktown", daId: "DA-5001" },
    });
    expect(da?.approvalPathway).toBe("da");
  });

  it("writes a distinct ingestion_log row per pathway", async () => {
    routeByEndpoint();
    await runIngest(1);

    const daLog = await testDb.ingestionLog.findFirst({
      where: { council: "blacktown", approvalPathway: "da", success: true },
    });
    const cdcLog = await testDb.ingestionLog.findFirst({
      where: { council: "blacktown", approvalPathway: "cdc", success: true },
    });
    expect(daLog?.sourceApi).toBe("nsw_planning");
    expect(daLog?.daCount).toBe(1);
    expect(cdcLog?.sourceApi).toBe("nsw_cdc");
    expect(cdcLog?.daCount).toBe(1);
  });

  it("does not fetch CDC when CDC_INGEST_ENABLED is explicitly off", async () => {
    process.env.CDC_INGEST_ENABLED = "false";
    routeByEndpoint();
    try {
      await runIngest(1);
    } finally {
      delete process.env.CDC_INGEST_ENABLED;
    }
    const cdcCount = await testDb.developmentApplication.count({
      where: { approvalPathway: "cdc" },
    });
    expect(cdcCount).toBe(0);
    // No cdc baseline row either — CDC was never active this run, so a
    // permanent count=0 log entry (and the drift alert it would trigger every
    // day) would be a false positive, not a real outage.
    const cdcLogCount = await testDb.ingestionLog.count({
      where: { council: "blacktown", approvalPathway: "cdc" },
    });
    expect(cdcLogCount).toBe(0);
  });

  it("still logs and drift-checks a cdc=0 baseline when the CDC feed goes fully dark for a council while DA stays healthy (#10)", async () => {
    const { captureMessage } = await import("@sentry/nextjs");

    // A week of healthy CDC history for blacktown.
    await testDb.ingestionLog.create({
      data: { council: "blacktown", approvalPathway: "cdc", sourceApi: "nsw_cdc", daCount: 5, success: true },
    });

    // Today: the DA endpoint returns a record (DA feed healthy), but the CDC
    // endpoint returns nothing at all — a total feed outage, not just a low day.
    (fetchWithRetry as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("complying-development-certificates")) {
        return Promise.resolve({ applications: [] });
      }
      return Promise.resolve({
        applications: [
          {
            applicationNumber: "DA-DARK-1",
            councilCode: "blacktown",
            address: "1 Slate Rd, Blacktown",
            proposedDevelopment: "New dwelling",
            estimatedCost: 50000,
            lodgedDate: new Date().toISOString(),
            applicant: null,
            url: "https://planningportal.nsw.gov.au/DA-DARK-1",
            scopeDescription: "Metal roof to new dwelling",
          },
        ],
      });
    });

    await runIngest(1);

    // A cdc=0 baseline row must be written even though zero CDC records arrived.
    const cdcLog = await testDb.ingestionLog.findFirst({
      where: { council: "blacktown", approvalPathway: "cdc", success: true, daCount: 0 },
    });
    expect(cdcLog).not.toBeNull();

    // ...and checkDrift must actually fire for the cdc pathway — the outage
    // this feature exists to catch — not just get silently logged.
    const cdcDriftCalls = (captureMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => (call[1] as { tags?: { pathway?: string } } | undefined)?.tags?.pathway === "cdc",
    );
    expect(cdcDriftCalls.length).toBeGreaterThan(0);

    // FR-003: CDC drift alert must also carry the source API and last success timestamp.
    const cdcTags = (cdcDriftCalls[0] as [string, { tags: Record<string, string> }])[1].tags;
    expect(cdcTags.source_api).toBe("nsw_cdc");
    expect(cdcTags.last_success_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
