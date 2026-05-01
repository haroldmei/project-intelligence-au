// Eviction of stale DAs that pre-date the determinationDate freshness fix.
// Two failure modes are both handled by the same heuristic:
//
// 1. Today-stamped fallback rows. Before the fix, every Determined DA whose
//    detail page lacked exhibitionStart got lodgement_date = scrape day.
//    These look "fresh" (lodgement_date == ingested_at::date) but the
//    underlying determination is years old.
// 2. True-but-stale rows. When the detail page DID expose exhibitionStart
//    from years ago, lodgement_date carried the real-but-stale date. The
//    new ingest filter drops these at write time going forward; this
//    script evicts the ones that landed before the filter shipped.
//
// Heuristic: source_api='da_exhibitions' AND
//   COALESCE(determination_date, lodgement_date) < today - 180 days
//   (matches the ingest-time freshness filter exactly)
//
// Usage:
//   pnpm cleanup-stale-das         (against .env.local)
//   pnpm cleanup-stale-das:staging (against .env.staging.local)
//   pnpm cleanup-stale-das:prod    (against .env.production.local)
//
// Add --dry-run to see counts without deleting.

import { db } from "@/lib/db";

const FRESHNESS_WINDOW_DAYS = 180;

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  // Stage 1: count to make the operator squint at the number first.
  const stale = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
      FROM development_applications
     WHERE source_api = 'da_exhibitions'
       AND COALESCE(determination_date, lodgement_date)
           < CURRENT_DATE - (${FRESHNESS_WINDOW_DAYS} || ' days')::interval
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

  // Stage 2: delete. da_embeddings cascades via FK, but digest_das and
  // da_feedback do not (no ON DELETE rule). Past digests reference these
  // stale DAs; we drop the references first inside a transaction so the
  // operation is all-or-nothing. Past digest history for affected DAs is
  // lost, which is fine — those past digests carried stale data anyway.
  const [deletedDigestDas, deletedFeedback, deletedDas] = await db.$transaction([
    db.$executeRaw`
      DELETE FROM digest_das
       WHERE da_id IN (
         SELECT id FROM development_applications
          WHERE source_api = 'da_exhibitions'
            AND COALESCE(determination_date, lodgement_date)
                < CURRENT_DATE - (${FRESHNESS_WINDOW_DAYS} || ' days')::interval
       )
    `,
    db.$executeRaw`
      DELETE FROM da_feedback
       WHERE da_id IN (
         SELECT id FROM development_applications
          WHERE source_api = 'da_exhibitions'
            AND COALESCE(determination_date, lodgement_date)
                < CURRENT_DATE - (${FRESHNESS_WINDOW_DAYS} || ' days')::interval
       )
    `,
    db.$executeRaw`
      DELETE FROM development_applications
       WHERE source_api = 'da_exhibitions'
         AND COALESCE(determination_date, lodgement_date)
             < CURRENT_DATE - (${FRESHNESS_WINDOW_DAYS} || ' days')::interval
    `,
  ]);
  console.log(
    `[cleanup] deleted ${deletedDas} DAs (${deletedDigestDas} digest_das refs, ${deletedFeedback} feedback refs)`,
  );

  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error("[cleanup] fatal:", err);
  process.exit(1);
});
