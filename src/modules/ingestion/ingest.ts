// Ingestion service — upserts raw DA records, writes ingestion_log, drift detection.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
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
        await checkDrift(region, result.ingested);
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
    // sourceApi reflects what the adapter actually returned. When records is
    // empty we don't know which underlying source ran (or whether it returned
    // [] because none was configured), so use "none" rather than lying.
    await db.ingestionLog.create({
      data: {
        council: region,
        sourceApi: records[0]?.sourceApi ?? "none",
        daCount: ingested,
        success: true,
      },
    });
    log.info(
      { council: region, ingested, sourceApi: records[0]?.sourceApi ?? "none" },
      "[ingest] region done",
    );
    return { council: region, ingested, failed: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ council: region, err: msg }, "[ingest] region failed");
    Sentry.captureException(err, { tags: { council: region, phase: "ingestion" } });
    await db.ingestionLog.create({
      data: { council: region, sourceApi: "error", daCount: 0, success: false, errorMessage: msg },
    });
    return { council: region, ingested: 0, failed: true, errorMessage: msg };
  }
}

async function upsertDa(r: NormalisedApplication): Promise<void> {
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
      sourceApi: r.sourceApi,
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
      sourceApi: r.sourceApi,
    },
  });
}

/**
 * Drift detection: compare today's count to the 7-day rolling average.
 * Alert if count = 0 OR drops > 50% (FR-003, system-design §7.3).
 */
async function checkDrift(council: string, todayCount: number): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const logs = await db.ingestionLog.findMany({
    where: { council, success: true, runAt: { gte: sevenDaysAgo } },
    select: { daCount: true },
  });

  if (logs.length === 0) return;
  const avg = logs.reduce((s, r) => s + r.daCount, 0) / logs.length;

  if (todayCount === 0 || (avg > 0 && todayCount / avg < 0.5)) {
    const msg = `Ingestion drift on ${council}: today=${todayCount}, 7d_avg=${avg.toFixed(1)}`;
    log.warn({ council, todayCount, avg }, msg);
    Sentry.captureMessage(msg, { level: "warning", tags: { council, phase: "ingestion-drift" } });
  }
}
