// One-off — re-fetch the detail page for every "Determined" DA already in
// the DB and mark Refused/Withdrawn ones as filtered out (rule_filtered_out=
// true) so they stop appearing in digests. New ingestion runs no longer
// persist these in the first place; this is just to clean up backfill.
//
// Run:
//   pnpm exec tsx --env-file-if-exists=.env.production.local scripts/cleanup-refused-das.ts

import { db } from "@/lib/db";
import { parseDaexDetail } from "@/modules/ingestion/sources";

const DAEX_USER_AGENT = "ProjectIntelligence-AU/1.0 (+https://www.pi-au.com)";

async function main(): Promise<void> {
  // Find every da_exhibitions DA whose portal_url is a /daex/determined/ link.
  const determinedDas = await db.developmentApplication.findMany({
    where: {
      sourceApi: "da_exhibitions",
      portalUrl: { contains: "/daex/determined/" },
      ruleFilteredOut: false,
    },
    select: { id: true, daId: true, council: true, portalUrl: true },
  });

  console.log(`[cleanup] checking ${determinedDas.length} determined DAs…`);
  let refused = 0;
  let kept = 0;
  let errors = 0;

  for (const da of determinedDas) {
    try {
      const res = await fetch(da.portalUrl, {
        headers: { "User-Agent": DAEX_USER_AGENT, Accept: "text/html" },
      });
      if (!res.ok) {
        errors++;
        continue;
      }
      const html = await res.text();
      const detail = parseDaexDetail(html);
      const decision = detail.decision?.toLowerCase() ?? "";
      const isRefused = /refus|withdraw|reject|dismiss/i.test(decision);
      if (isRefused) {
        await db.developmentApplication.update({
          where: { id: da.id },
          data: { ruleFilteredOut: true },
        });
        refused++;
        console.log(`  ✗ [${da.council}] ${da.daId} — ${detail.decision} (filtered)`);
      } else {
        kept++;
      }
      // Be polite.
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      errors++;
      console.error(`  ! [${da.council}] ${da.daId} — fetch failed:`, err);
    }
  }

  console.log(`[cleanup] done — kept=${kept} refused=${refused} errors=${errors}`);
  await db.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error("[cleanup] fatal:", err);
  await db.$disconnect();
  process.exit(1);
});
