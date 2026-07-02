// Integration tests for src/modules/ingestion/
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// Vitest + real Postgres test DB (TEST_DATABASE_URL)
// Hard-fail: 80% line coverage on exported functions (NFR-024)
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Mock external fetch to avoid live API calls during tests. NSW_PLANNING_API_KEY
// and DA_LEADS_API_KEY are seeded in __tests__/setup-env.ts so the dispatcher
// routes through these mocks instead of short-circuiting to [].
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

    // Seed a historical log entry (success, daCount > 0)
    await testDb.ingestionLog.create({
      data: { council: "blacktown", sourceApi: "nsw_planning", daCount: 10, success: true },
    });

    // Mock fetch returning 0 results
    (fetchWithRetry as ReturnType<typeof vi.fn>).mockResolvedValue({ applications: [] });
    await runIngest(1);

    expect(captureMessage).toHaveBeenCalled();
  });
});
