// Integration tests for the compensating nightly-ingest retry (issue #125).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// Vitest + real Postgres test DB (TEST_DATABASE_URL).
//
// A per-LGA transient upstream failure on the Saturday-night ingest must be
// re-fetched (by the hourly /api/cron/ingest-retry cron) BEFORE the Sunday
// 17:00 digest reads that LGA's DAs — the nightly ingest itself has no retry.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

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
import {
  runIngest,
  retryFailedIngest,
  MAX_INGEST_RETRY_ATTEMPTS,
} from "@/modules/ingestion/ingest";

const mockFetch = fetchWithRetry as ReturnType<typeof vi.fn>;

/** One healthy DA payload; the councilSlug is stamped from the fetched region. */
function oneDaPayload(daId = "DA-5001") {
  return {
    applications: [
      {
        applicationNumber: daId,
        councilCode: "blacktown",
        address: "3 Gable Ave",
        proposedDevelopment: "Alterations and additions to dwelling",
        estimatedCost: 120000,
        lodgedDate: new Date().toISOString(),
        applicant: null,
        url: "https://planningportal.nsw.gov.au/DA-5001",
        scopeDescription: "New roof over rear extension",
      },
    ],
  };
}

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
  vi.clearAllMocks();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("retryFailedIngest — compensating nightly-ingest retry (#125)", () => {
  it("re-fetches ONLY the LGA that failed the nightly run and lands a success row before the digest", async () => {
    // Nightly run: Blacktown's upstream fetch fails transiently, every other
    // council succeeds. Blacktown's URL carries `council=Blacktown City Council`.
    mockFetch.mockImplementation((url: string) =>
      url.includes("Blacktown")
        ? Promise.reject(new Error("ePlanning 503 (transient)"))
        : Promise.resolve(oneDaPayload()),
    );

    const nightly = await runIngest(1);
    expect(nightly.totalFailed).toBe(1);

    const blacktownFail = await testDb.ingestionLog.findFirst({
      where: { council: "blacktown", success: false },
    });
    expect(blacktownFail).not.toBeNull();
    // The digest would read Blacktown right now and find nothing lodged.
    expect(
      await testDb.ingestionLog.count({ where: { council: "blacktown", success: true } }),
    ).toBe(0);

    // The feed recovers; the hourly retry cron fires.
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(oneDaPayload());

    const retry = await retryFailedIngest(1);

    // Exactly the failed LGA was retried — no re-fetch of the healthy 14. Each
    // pass fetch carries the Blacktown council param (the DA endpoint uses the
    // display name "Blacktown City Council", the CDC endpoint the slug
    // "blacktown"), and never another council.
    expect(retry.retriedCouncils).toEqual(["blacktown"]);
    for (const call of mockFetch.mock.calls) {
      expect(String(call[0]).toLowerCase()).toContain("blacktown");
    }

    // ingestion_log now ends with a success=true row for Blacktown, and its DA
    // is present for the digest to read.
    expect(
      await testDb.ingestionLog.count({ where: { council: "blacktown", success: true } }),
    ).toBeGreaterThan(0);
    expect(
      await testDb.developmentApplication.count({ where: { council: "blacktown" } }),
    ).toBeGreaterThan(0);
  });

  it("is a no-op when the nightly run had no failures", async () => {
    mockFetch.mockResolvedValue(oneDaPayload());
    await runIngest(1);

    mockFetch.mockClear();
    const retry = await retryFailedIngest(1);

    expect(retry.retriedCouncils).toEqual([]);
    expect(retry.totalIngested).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips a council that already recovered on an earlier retry tick", async () => {
    // A failure followed by a later success within the same night → nothing to do.
    const now = Date.now();
    await testDb.ingestionLog.create({
      data: {
        council: "parramatta",
        sourceApi: "error",
        daCount: 0,
        success: false,
        runAt: new Date(now - 60 * 60 * 1000),
      },
    });
    await testDb.ingestionLog.create({
      data: {
        council: "parramatta",
        sourceApi: "nsw_planning",
        daCount: 4,
        success: true,
        runAt: new Date(now - 30 * 60 * 1000),
      },
    });

    mockFetch.mockResolvedValue(oneDaPayload());
    const retry = await retryFailedIngest(1);

    expect(retry.retriedCouncils).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("re-fetches a council whose only row tonight is a failure (seeded)", async () => {
    await testDb.ingestionLog.create({
      data: { council: "parramatta", sourceApi: "error", daCount: 0, success: false },
    });

    mockFetch.mockResolvedValue(oneDaPayload());
    const retry = await retryFailedIngest(1);

    expect(retry.retriedCouncils).toEqual(["parramatta"]);
    expect(
      await testDb.ingestionLog.count({ where: { council: "parramatta", success: true } }),
    ).toBeGreaterThan(0);
  });

  it("gives up (leaves it to drift detection) after MAX_INGEST_RETRY_ATTEMPTS failures in the night", async () => {
    for (let i = 0; i < MAX_INGEST_RETRY_ATTEMPTS; i++) {
      await testDb.ingestionLog.create({
        data: {
          council: "penrith",
          sourceApi: "error",
          daCount: 0,
          success: false,
          runAt: new Date(Date.now() - i * 60 * 1000),
        },
      });
    }

    mockFetch.mockResolvedValue(oneDaPayload());
    const retry = await retryFailedIngest(1);

    expect(retry.retriedCouncils).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
