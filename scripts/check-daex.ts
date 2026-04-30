// Diagnostic — verifies DAEX_INGEST_ENABLED is on AND the live Portal
// returns records for our 15 LGAs. Run with prod creds:
//
//   pnpm exec tsx --env-file-if-exists=.env.production.local scripts/check-daex.ts

import { fetchCouncilDAs } from "@/modules/ingestion/sources";
import { env } from "@/lib/env";
import { ALL_COUNCIL_SLUGS } from "@/modules/ingestion/ingest";

async function main(): Promise<void> {
  console.log("DAEX_INGEST_ENABLED =", env.DAEX_INGEST_ENABLED);
  console.log("NSW_PLANNING_API_KEY set =", Boolean(env.NSW_PLANNING_API_KEY));
  console.log("DA_LEADS_API_KEY set =", Boolean(env.DA_LEADS_API_KEY));
  console.log();

  const totals: Record<string, number> = {};
  for (const slug of ALL_COUNCIL_SLUGS) {
    const records = await fetchCouncilDAs(slug, 14);
    totals[slug] = records.length;
    console.log(slug.padEnd(20), "→", records.length, "records");
  }

  console.log();
  console.log("total:", Object.values(totals).reduce((a, b) => a + b, 0));
}

main().catch((err: unknown) => {
  console.error("[check-daex] fatal:", err);
  process.exit(1);
});
