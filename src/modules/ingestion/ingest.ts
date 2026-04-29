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
import { fetchCouncilDAs } from "./sources";
import type { RawDaRecord } from "./sources";

const log = pino({ name: "ingestion" });

/** All 15 supported LGA council slugs (wedge: 15 LGAs). */
export const ALL_COUNCIL_SLUGS = [
  // NSW Planning Portal coverage
  "blacktown",
  "blue_mountains",
  "camden",
  "campbelltown_nsw",
  "fairfield",
  "hawkesbury",
  "hills_shire",
  "liverpool",
  "parramatta",
  "penrith",
  "wollondilly",
  // DA Leads / Council DA coverage
  "bayside_nsw",
  "canada_bay",
  "inner_west",
  "strathfield",
] as const;

export type CouncilSlug = (typeof ALL_COUNCIL_SLUGS)[number];

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
 * Ingest DAs for all 15 councils. Each council is fetched and upserted
 * independently so one failure does not block others (FR-001, FR-002).
 * Drift detection alerts via Sentry when a council drops > 50% (FR-003).
 */
export async function runIngest(sinceDaysBack = 1): Promise<RunIngestResult> {
  const results: IngestResult[] = [];

  // Per system-design §3.3 nightly flow: fetch per-LGA in sequence (polite delay inside adapter)
  for (const council of ALL_COUNCIL_SLUGS) {
    const result = await ingestCouncil(council, sinceDaysBack);
    results.push(result);
    if (!result.failed) {
      await checkDrift(council, result.ingested);
    }
  }

  const totalIngested = results.reduce((s, r) => s + r.ingested, 0);
  const totalFailed = results.filter((r) => r.failed).length;

  log.info({ totalIngested, totalFailed }, "[ingest] run complete");
  return { results, totalIngested, totalFailed };
}

async function ingestCouncil(council: string, sinceDaysBack: number): Promise<IngestResult> {
  try {
    const records = await fetchCouncilDAs(council, sinceDaysBack);
    let ingested = 0;
    for (const r of records) {
      await upsertDa(r);
      ingested++;
    }
    await db.ingestionLog.create({
      data: {
        council,
        sourceApi: records[0]?.sourceApi ?? "nsw_planning",
        daCount: ingested,
        success: true,
      },
    });
    log.info({ council, ingested }, "[ingest] council done");
    return { council, ingested, failed: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ council, err: msg }, "[ingest] council failed");
    Sentry.captureException(err, { tags: { council, phase: "ingestion" } });
    await db.ingestionLog.create({
      data: { council, sourceApi: "nsw_planning", daCount: 0, success: false, errorMessage: msg },
    });
    return { council, ingested: 0, failed: true, errorMessage: msg };
  }
}

async function upsertDa(r: RawDaRecord): Promise<void> {
  await db.developmentApplication.upsert({
    where: { daId_council: { daId: r.daId, council: r.council } },
    create: {
      daId: r.daId,
      council: r.council,
      address: r.address,
      description: r.description,
      estimatedValue: r.estimatedValue,
      lodgementDate: new Date(r.lodgementDate),
      applicantName: r.applicantName,
      portalUrl: r.portalUrl,
      rawScopeText: r.rawScopeText,
      sourceApi: r.sourceApi,
      ruleFilteredOut: false,
    },
    update: {
      address: r.address,
      description: r.description,
      estimatedValue: r.estimatedValue,
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
