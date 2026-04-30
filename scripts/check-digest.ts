// Diagnostic — answers "why did the digest produce 0 cards for this user?"
// Walks every gate the relevance pipeline applies and reports counts.
//
// Usage:
//   pnpm exec tsx --env-file-if-exists=.env.production.local scripts/check-digest.ts <userId>

import { db } from "@/lib/db";

async function main(): Promise<void> {
  const userId = process.argv[2];
  if (!userId) {
    console.error("usage: tsx scripts/check-digest.ts <userId>");
    process.exit(2);
  }

  // 1. User existence + the four prerequisite gates.
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { lgaBundles: true },
  });
  if (!user) {
    console.log(`✗ user ${userId} not found`);
    return;
  }
  console.log("user:", user.email);
  console.log("  email_verified:", user.emailVerified);
  console.log("  subscription_status:", user.subscriptionStatus);
  console.log("  lga_bundles:", user.lgaBundles.map((b) => b.bundleId));
  const queryEmbed = await db.$queryRaw<Array<{ has: boolean }>>`
    SELECT (saved_query_embedding IS NOT NULL) AS has FROM users WHERE id = ${userId}
  `;
  console.log("  has saved_query_embedding:", queryEmbed[0]?.has);
  console.log("  saved_query_text:", user.savedQueryText?.slice(0, 80) ?? "(null)");
  console.log();

  // 2. User's councils.
  const lgas = await db.lga.findMany({
    where: { bundleId: { in: user.lgaBundles.map((b) => b.bundleId) } },
  });
  const councils = lgas.map((l) => l.id);
  console.log("user's councils:", councils);
  console.log();

  // 3. Total DAs in those councils.
  const total = await db.developmentApplication.count({
    where: { council: { in: councils } },
  });
  console.log("DAs in user's councils (any date, any source):", total);

  // 4. After 7-day window.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const inWindow = await db.developmentApplication.count({
    where: { council: { in: councils }, lodgementDate: { gte: sevenDaysAgo } },
  });
  console.log("  + lodgement_date >= 7d ago:", inWindow);

  // 5. After rule_filtered_out=false.
  const notFilteredOut = await db.developmentApplication.count({
    where: {
      council: { in: councils },
      lodgementDate: { gte: sevenDaysAgo },
      ruleFilteredOut: false,
    },
  });
  console.log("  + rule_filtered_out=false:", notFilteredOut);

  // 6. After tsvector keyword match — same SQL the rule filter actually runs.
  const tsQuery =
    "roof | roofing | re-roof | reroof | metal<->roof | colorbond | colour<->bond | membrane | gutters | downpipes | skylights | roof<->tiles | roof<->replacement | roof<->restoration | roof<->repair | insulation | fascia | barge | ridge<->cap | hip<->and<->ridge | sarking | rooflight | dwelling | residential | alterations | additions | alterations<->and<->additions | construction<->of | single<->storey | two<->storey | dual<->occupancy | secondary<->dwelling";
  const matchedRows = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM development_applications
    WHERE council = ANY(${councils})
      AND lodgement_date >= ${sevenDaysAgo}::date
      AND rule_filtered_out = false
      AND to_tsvector('english', coalesce(description,'') || ' ' || coalesce(raw_scope_text,''))
            @@ to_tsquery('english', ${tsQuery})
  `;
  const matchedCount = matchedRows[0]?.count ?? BigInt(0);
  console.log("  + tsvector keyword match:", Number(matchedCount));
  console.log();

  // 7. Show 5 examples of DAs that didn't pass the keyword filter.
  console.log("first 5 DAs in user's councils that DIDN'T match keywords:");
  const examples = await db.$queryRaw<
    Array<{ da_id: string; council: string; description: string; lodgement_date: Date }>
  >`
    SELECT da_id, council, description, lodgement_date
    FROM development_applications
    WHERE council = ANY(${councils})
      AND lodgement_date >= ${sevenDaysAgo}::date
      AND rule_filtered_out = false
      AND NOT (to_tsvector('english', coalesce(description,'') || ' ' || coalesce(raw_scope_text,''))
            @@ to_tsquery('english', ${tsQuery}))
    LIMIT 5
  `;
  for (const e of examples) {
    console.log(` - [${e.council}] ${e.da_id}: ${e.description.slice(0, 100)}`);
  }
  console.log();

  console.log("first 5 DAs that DID match:");
  const matched = await db.$queryRaw<
    Array<{ da_id: string; council: string; description: string }>
  >`
    SELECT da_id, council, description
    FROM development_applications
    WHERE council = ANY(${councils})
      AND lodgement_date >= ${sevenDaysAgo}::date
      AND rule_filtered_out = false
      AND to_tsvector('english', coalesce(description,'') || ' ' || coalesce(raw_scope_text,''))
            @@ to_tsquery('english', ${tsQuery})
    LIMIT 5
  `;
  for (const e of matched) {
    console.log(` - [${e.council}] ${e.da_id}: ${e.description.slice(0, 100)}`);
  }

  await db.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error("[check-digest] fatal:", err);
  await db.$disconnect();
  process.exit(1);
});
