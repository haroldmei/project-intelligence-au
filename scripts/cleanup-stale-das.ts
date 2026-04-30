// One-shot eviction of stale DAs that the old DAEX adapter falsely stamped
// with lodgement_date = today. Before the determinationDate fix, every
// Determined DA whose detail page lacked exhibitionStart got lodgement_date
// set to the day it was scraped, regardless of when it was actually
// determined years prior. After the fix, freshly-ingested rows carry the
// real determination_date and the >180-day filter drops them at ingest —
// but the existing rows still need a one-time cleanup.
//
// Heuristic: lodgement_date == ingested_at::date AND ingested_at < today
//   → row was stamped on a past ingest run (not a same-day fresh ingest).
//   → almost certainly a stale Determined DA from the old adapter.
//
// Usage:
//   pnpm cleanup-stale-das         (against .env.local)
//   pnpm cleanup-stale-das:staging (against .env.staging.local)
//   pnpm cleanup-stale-das:prod    (against .env.production.local)
//
// Add --dry-run to see counts without deleting.

import { db } from "@/lib/db";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  // Stage 1: count to make the operator squint at the number first.
  const stale = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
      FROM development_applications
     WHERE lodgement_date = ingested_at::date
       AND ingested_at < CURRENT_DATE
       AND source_api = 'da_exhibitions'
  `;
  const count = Number(stale[0]?.count ?? 0);
  console.log(`[cleanup] stale candidate rows: ${count}`);

  if (count === 0) {
    console.log("[cleanup] nothing to do");
    await db.$disconnect();
    return;
  }

  if (dryRun) {
    console.log("[cleanup] --dry-run; not deleting");
    await db.$disconnect();
    return;
  }

  // Stage 2: delete. Cascade handles digest_das + da_embeddings via FK.
  const result = await db.$executeRaw`
    DELETE FROM development_applications
     WHERE lodgement_date = ingested_at::date
       AND ingested_at < CURRENT_DATE
       AND source_api = 'da_exhibitions'
  `;
  console.log(`[cleanup] deleted ${result} rows`);

  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error("[cleanup] fatal:", err);
  process.exit(1);
});
