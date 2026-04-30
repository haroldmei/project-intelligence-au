// Digest cron service — iterates active subscribers, runs relevance, sends digest.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-009 | system-design §2 digest, §3.3 Sunday digest data flow, §7.3
//
// Cron schedule (vercel.json):
//   "0 7 * * 0"  — every Sunday 07:00 UTC = 17:00 AEST (UTC+10)
//   AEST is UTC+10 (non-daylight-saving, AEDT is UTC+11 in summer).
//   In AEDT (summer, Oct–Apr), 07:00 UTC = 18:00 AEDT — one-hour drift, acceptable.
//   The contract (queue.weekly_cron) pins "Sunday 17:00 AEST = 07:00 UTC Sunday".
//   NFR-001: cron must complete in < 55 minutes for N ≤ 100 users.
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { runRelevanceForUser } from "@/modules/relevance/run";
import { assembleAndSendDigest } from "./assemble";
import pino from "pino";

const log = pino({ name: "digest-cron" });

export interface DigestCronResult {
  runId: string;
  usersProcessed: number;
  sent: number;
  failed: number;
  durationMs: number;
}

/**
 * Main digest cron entrypoint. Creates a DigestRun record, processes each
 * active subscriber in sequence (N ≤ 100 at preview tier), updates run status.
 *
 * Per-user errors are caught and do NOT abort the run (system-design §7 —
 * Sunday cron partial failure isolation).
 */
export async function runDigestCron(): Promise<DigestCronResult> {
  const startTime = Date.now();

  // Create DigestRun record
  const run = await db.digestRun.create({
    data: {
      runDate: new Date(),
      status: "running",
    },
  });

  log.info({ runId: run.id }, "[digest] cron started");

  // Load active subscribers. Hard cap matches NFR-008 (≤ 100 active subs at
  // preview tier). At launch tier with > 100 subscribers, paginate this
  // query — the in-process digest loop wasn't designed for thousands of
  // users in a single Vercel function invocation.
  const users = await db.user.findMany({
    where: {
      emailVerified: true,
      subscriptionStatus: { in: ["trial", "active"] },
    },
    select: { id: true, email: true },
    take: 1000,
  });

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const relevance = await runRelevanceForUser(user.id);
      if (!relevance) {
        // Persist a Digest row anyway so observability queries can answer
        // "did Sunday work for everyone?" — null relevance means the user
        // is missing prerequisites (saved query embedding, LGAs, etc.).
        await db.digest
          .create({
            data: {
              userId: user.id,
              runId: run.id,
              daCount: 0,
              fallbackUsed: false,
              emailStatus: "skipped",
            },
          })
          .catch(() => {
            /* best-effort audit row */
          });
        log.warn({ userId: user.id }, "[digest] no relevance result — skipping user");
        continue;
      }
      const result = await assembleAndSendDigest(user.id, run.id, relevance);
      if (result.emailStatus === "sent") {
        sent++;
      } else {
        failed++;
      }
      log.info(
        { userId: user.id, digestId: result.digestId, emailStatus: result.emailStatus },
        "[digest] user processed",
      );
    } catch (err) {
      failed++;
      // Audit row even on hard failure so the digest_runs/digests join
      // can show "this user was attempted but errored".
      await db.digest
        .create({
          data: {
            userId: user.id,
            runId: run.id,
            daCount: 0,
            fallbackUsed: false,
            emailStatus: "failed",
          },
        })
        .catch(() => {
          /* best-effort */
        });
      log.error({ userId: user.id, err }, "[digest] unhandled error for user — continuing");
      Sentry.captureException(err, { tags: { userId: user.id, phase: "digest-user" } });
    }
  }

  const durationMs = Date.now() - startTime;
  const status = failed === users.length && users.length > 0 ? "failed" : "done";

  // Update DigestRun
  await db.digestRun.update({
    where: { id: run.id },
    data: {
      completedAt: new Date(),
      userCount: users.length,
      status,
    },
  });

  // NFR-001: alert if > 55 minutes
  if (durationMs > 55 * 60 * 1000) {
    Sentry.captureMessage(`Digest cron exceeded 55-minute SLA: ${durationMs / 1000}s`, {
      level: "warning",
      tags: { runId: run.id, phase: "digest-sla" },
    });
  }

  log.info({ runId: run.id, sent, failed, durationMs }, "[digest] cron complete");
  return { runId: run.id, usersProcessed: users.length, sent, failed, durationMs };
}
