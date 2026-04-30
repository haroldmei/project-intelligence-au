// Manually trigger the daily ingestion cron against the configured DB.
// Mirrors run-digest-now.ts. Useful for verifying the pipeline end-to-end
// without waiting for the 13:00 UTC cron, and without hitting Cloudflare's
// 100s edge timeout that breaks /api/cron/ingest manual curls.
//
// Usage:
//   pnpm ingest:now:prod              # all 15 LGAs (default sinceDaysBack=1)
//   pnpm ingest:now:prod 14           # custom window in days
//
// Calls runIngest() directly — same code path as /api/cron/ingest, just no
// CRON_SECRET auth and no edge layer in front of it.

import { runIngest } from "@/modules/ingestion/ingest";
import { db } from "@/lib/db";

async function main(): Promise<void> {
  const sinceDaysBack = Number.parseInt(process.argv[2] ?? "1", 10);
  if (!Number.isFinite(sinceDaysBack) || sinceDaysBack < 1) {
    console.error("usage: pnpm ingest:now:prod [sinceDaysBack=1]");
    process.exit(2);
  }

  console.log(`[ingest] running for last ${sinceDaysBack} day(s)…`);
  const start = Date.now();
  const result = await runIngest(sinceDaysBack);
  const seconds = Math.round((Date.now() - start) / 100) / 10;

  console.log(`[ingest] done in ${seconds}s — totalIngested=${result.totalIngested} totalFailed=${result.totalFailed}`);
  console.log("per-council:");
  for (const r of result.results) {
    const status = r.failed ? "✗" : "✓";
    console.log(`  ${status} ${r.council.padEnd(20)} ${r.ingested} ${r.errorMessage ?? ""}`);
  }
  await db.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error("[ingest] fatal:", err);
  await db.$disconnect();
  process.exit(1);
});
