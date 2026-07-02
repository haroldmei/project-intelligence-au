// Ingestion service — upserts raw DA records, writes ingestion_log, drift detection.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-001, FR-002, FR-003 | system-design §2 ingestion component + §3.3 nightly flow
//
// ASSUMPTION: The Prisma schema has DevelopmentApplication (mapped table development_applications)
// and IngestionLog (mapped ingestion_log). Both confirmed present in prisma/schema.prisma.
// ASSUMPTION: `RawDA` table is NOT needed separately — raw records go into `development_applications`
// with `ruleFilteredOut: false` by default. If a dedicated RawDA staging table is required,
// db-migrator should add it; today `development_applications` is the canonical store.
import { db } from "@/lib/db";
import pino from "pino";
import * as Sentry from "@sentry/nextjs";
import { getEnabledJurisdictions } from "./jurisdictions/registry";
import { NSW_REGIONS, MS_PER_DAY } from "./jurisdictions/config";
import type { JurisdictionAdapter, NormalisedApplication } from "./jurisdictions/types";

const log = pino({ name: "ingestion" });

/**
 * All 15 supported NSW LGA council slugs. Canonical list lives in
 * `jurisdictions/config.ts` (NSW_REGIONS) and is re-exported here for the
 * downstream code + seed that reference `ALL_COUNCIL_SLUGS`. Keep in sync with
 * prisma/seed.ts LGAS.
 */
export const ALL_COUNCIL_SLUGS = NSW_REGIONS;

export type CouncilSlug = (typeof NSW_REGIONS)[number];

export interface IngestResult {
  council: string;
  ingested: number;
  failed: boolean;
  errorMessage?: string;
  /**
   * Per-pathway ingested counts (#10). A region's records are split by approval
   * pathway (da|cdc|ssd) so each is logged and drift-checked independently — a
   * CDC-feed outage must not be masked by healthy DA volume, and vice versa.
   * Always carries the `da` baseline (count 0 when the region ingested nothing),
   * matching the pre-#10 one-row-per-region behaviour.
   */
  pathwayCounts: Array<{ pathway: string; count: number }>;
}

export interface RunIngestResult {
  results: IngestResult[];
  totalIngested: number;
  totalFailed: number;
}

/**
 * Ingest DAs for every enabled jurisdiction (issue #28). NSW is the incumbent
 * (always enabled) and fans out over its 15 councils; additional statewide
 * jurisdictions (e.g. PlanSA) are gated behind their own flag and fetched as a
 * single region. Each region is fetched and upserted independently so one
 * failure does not block others (FR-001, FR-002). Drift detection alerts via
 * Sentry when a council drops > 50% (FR-003).
 *
 * With every optional jurisdiction flag off, this iterates exactly the 15 NSW
 * councils in their original order — byte-identical to the pre-#28 pipeline.
 */
export async function runIngest(sinceDaysBack = 1): Promise<RunIngestResult> {
  const results: IngestResult[] = [];
  const since = new Date(Date.now() - sinceDaysBack * MS_PER_DAY);

  // Per system-design §3.3 nightly flow: fetch per-region in sequence (polite
  // delay inside the adapter).
  for (const jurisdiction of getEnabledJurisdictions()) {
    for (const region of jurisdiction.regions) {
      const result = await ingestRegion(jurisdiction.adapter, region, since);
      results.push(result);
      if (!result.failed && jurisdiction.driftDetection) {
        // Drift is checked per pathway (#10): a CDC-feed drop and a DA-feed drop
        // are independent signals and must not average each other out.
        for (const { pathway, count } of result.pathwayCounts) {
          await checkDrift(region, pathway, count);
        }
      }
    }
  }

  const totalIngested = results.reduce((s, r) => s + r.ingested, 0);
  const totalFailed = results.filter((r) => r.failed).length;

  log.info({ totalIngested, totalFailed }, "[ingest] run complete");
  return { results, totalIngested, totalFailed };
}

/**
 * Ingest one region of one jurisdiction through its adapter. One failure is
 * isolated and logged, never blocking the run. `council` on the log/result
 * carries the region slug (a NSW council, or the jurisdiction id for statewide
 * feeds).
 */
async function ingestRegion(
  adapter: JurisdictionAdapter,
  region: string,
  since: Date,
): Promise<IngestResult> {
  try {
    const records = await adapter.fetchApplications({ since, regions: [region] });
    let ingested = 0;
    for (const r of records) {
      await upsertDa(r);
      ingested++;
    }

    // Split the region's records by approval pathway (#10) and write one
    // ingestion_log row per pathway, so the drift alert can tell a DA-feed drop
    // apart from a CDC-feed drop. The `da` baseline is ALWAYS written (count 0
    // when the region ingested nothing), preserving the pre-#10 one-row-per-
    // region behaviour byte-for-byte when no CDC records are present. `sourceApi`
    // on each row reflects a record actually returned for that pathway, falling
    // back to "none" for the empty DA baseline.
    const pathwayCounts = summarisePathways(records);
    for (const { pathway, count, sourceApi } of pathwayCounts) {
      await db.ingestionLog.create({
        data: { council: region, approvalPathway: pathway, sourceApi, daCount: count, success: true },
      });
    }
    log.info(
      { council: region, ingested, pathways: pathwayCounts.map((p) => `${p.pathway}:${p.count}`) },
      "[ingest] region done",
    );
    return {
      council: region,
      ingested,
      failed: false,
      pathwayCounts: pathwayCounts.map(({ pathway, count }) => ({ pathway, count })),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ council: region, err: msg }, "[ingest] region failed");
    Sentry.captureException(err, { tags: { council: region, phase: "ingestion" } });
    await db.ingestionLog.create({
      data: { council: region, sourceApi: "error", daCount: 0, success: false, errorMessage: msg },
    });
    return { council: region, ingested: 0, failed: true, errorMessage: msg, pathwayCounts: [] };
  }
}

/**
 * Group a region's records into per-pathway counts for logging + drift. Always
 * includes the `da` baseline first (count 0 when absent) so the DA drift series
 * is continuous; any other pathway (cdc, ssd) appears only when it produced
 * records. `sourceApi` is the last source seen for that pathway — records within
 * one pathway share a source in practice.
 */
function summarisePathways(
  records: NormalisedApplication[],
): Array<{ pathway: string; count: number; sourceApi: string }> {
  const byPathway = new Map<string, { count: number; sourceApi: string }>();
  byPathway.set("da", { count: 0, sourceApi: "none" });
  for (const r of records) {
    const entry = byPathway.get(r.approvalPathway) ?? { count: 0, sourceApi: r.sourceApi };
    entry.count++;
    entry.sourceApi = r.sourceApi;
    byPathway.set(r.approvalPathway, entry);
  }
  return [...byPathway.entries()]
    .filter(([pathway, { count }]) => pathway === "da" || count > 0)
    .map(([pathway, { count, sourceApi }]) => ({ pathway, count, sourceApi }));
}

/**
 * Upsert one normalised record into development_applications, keyed on
 * (daId, council). Exported so the integration suite can exercise the write
 * mapping directly — notably that `developmentType` (#26) round-trips through
 * the new column — without driving a full paginated fetch.
 */
export async function upsertDa(r: NormalisedApplication): Promise<void> {
  const determinationDate = r.determinationDate ? new Date(r.determinationDate) : null;
  await db.developmentApplication.upsert({
    where: { daId_council: { daId: r.daId, council: r.council } },
    create: {
      daId: r.daId,
      council: r.council,
      jurisdiction: r.jurisdiction,
      address: r.address,
      description: r.description,
      estimatedValue: r.estimatedValue,
      lodgementDate: new Date(r.lodgementDate),
      determinationDate,
      applicantName: r.applicantName,
      portalUrl: r.portalUrl,
      rawScopeText: r.rawScopeText,
      developmentType: r.developmentType,
      sourceApi: r.sourceApi,
      approvalPathway: r.approvalPathway,
      ruleFilteredOut: false,
    },
    update: {
      jurisdiction: r.jurisdiction,
      address: r.address,
      description: r.description,
      estimatedValue: r.estimatedValue,
      determinationDate,
      applicantName: r.applicantName,
      portalUrl: r.portalUrl,
      rawScopeText: r.rawScopeText,
      developmentType: r.developmentType,
      sourceApi: r.sourceApi,
      approvalPathway: r.approvalPathway,
    },
  });
}

/**
 * Drift detection: compare today's count to the 7-day rolling average, PER
 * PATHWAY (#10). Alert if count = 0 OR drops > 50% (FR-003, system-design §7.3).
 * Scoping the rolling average to the same `approvalPathway` keeps a CDC-feed
 * outage from being masked by healthy DA volume (and vice versa). The current
 * run's row for this pathway has already been written, so a genuinely-dead feed
 * shows a today-average of 0 across the window and still fires on the count=0
 * branch.
 */
async function checkDrift(council: string, pathway: string, todayCount: number): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const logs = await db.ingestionLog.findMany({
    where: { council, approvalPathway: pathway, success: true, runAt: { gte: sevenDaysAgo } },
    select: { daCount: true },
  });

  if (logs.length === 0) return;
  const avg = logs.reduce((s, r) => s + r.daCount, 0) / logs.length;

  if (todayCount === 0 || (avg > 0 && todayCount / avg < 0.5)) {
    const msg = `Ingestion drift on ${council} (${pathway}): today=${todayCount}, 7d_avg=${avg.toFixed(1)}`;
    log.warn({ council, pathway, todayCount, avg }, msg);
    Sentry.captureMessage(msg, {
      level: "warning",
      tags: { council, pathway, phase: "ingestion-drift" },
    });
  }
}
