// Manually trigger the Sunday digest cron against the configured DB.
// Useful for verifying the pipeline end-to-end without waiting for Sunday.
//
// Usage:
//   pnpm exec tsx --env-file-if-exists=.env.local scripts/run-digest-now.ts
//
// Per-user only:
//   pnpm exec tsx scripts/run-digest-now.ts <userId>
//
// Skips the cron-secret guard. Bypasses /api/cron/digest entirely; calls
// runDigestCron() directly so you can read full stdout. Sends real email
// + SMS through the configured Resend / Twilio credentials, so RUN
// AGAINST DEV/STAGING unless you mean it.

import { db } from "@/lib/db";
import { runDigestCron } from "@/modules/digest/cron";
import { runRelevanceForUser } from "@/modules/relevance/run";
import { assembleAndSendDigest } from "@/modules/digest/assemble";

async function main(): Promise<void> {
  const userId = process.argv[2];

  if (!userId) {
    console.log("[run-digest] running full Sunday cron for every active subscriber…");
    const result = await runDigestCron();
    console.log(JSON.stringify(result, null, 2));
    await db.$disconnect();
    return;
  }

  // Per-user path — skips the user-scan, useful for targeted testing.
  console.log(`[run-digest] single user: ${userId}`);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`[run-digest] no user with id=${userId}`);
    process.exit(1);
  }

  const run = await db.digestRun.create({
    data: { runDate: new Date(), status: "running" },
  });

  const relevance = await runRelevanceForUser(userId);
  if (!relevance) {
    console.error("[run-digest] relevance returned null — user is missing saved query, LGAs, or status");
    await db.digestRun.update({ where: { id: run.id }, data: { status: "failed", completedAt: new Date() } });
    await db.$disconnect();
    process.exit(1);
  }
  console.log(`[run-digest] relevance: ${relevance.results.length} candidates, fallback=${relevance.fallbackUsed}`);

  const out = await assembleAndSendDigest(userId, run.id, relevance);
  console.log(JSON.stringify(out, null, 2));

  await db.digestRun.update({
    where: { id: run.id },
    data: { status: "done", completedAt: new Date(), userCount: 1 },
  });
  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error("[run-digest] fatal:", err);
  process.exit(1);
});
