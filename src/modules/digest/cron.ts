// Digest cron service — iterates active subscribers, runs relevance, sends digest.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
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
import { cronWeekStartUtc } from "@/lib/cron/retry";
import { runRelevanceForUser } from "@/modules/relevance/run";
import { assembleAndSendDigest } from "./assemble";
import { entitledDigestWhere } from "@/modules/billing/entitlement";
import { digestWeekWindow, getJurisdictionConfig } from "@/modules/ingestion/jurisdictions/config";
import pino from "pino";

const log = pino({ name: "digest-cron" });

export interface DigestCronResult {
  runId: string;
  /** True when this invocation resumed an existing week's run (the retry tick). */
  resumed: boolean;
  usersProcessed: number;
  sent: number;
  failed: number;
  /** Active users still without a delivered digest after this pass. */
  unserved: number;
  durationMs: number;
}

/**
 * A Digest row needs no further work for the week when BOTH channels have
 * reached a terminal state — delivered, or legitimately not sendable.
 *
 * Retryable (NOT complete): emailStatus "failed"/"pending"/null, or
 * smsStatus "failed". A user with no Digest row for the run is likewise
 * treated as incomplete (never attempted).
 */
export function isDigestComplete(d: {
  emailStatus: string | null;
  smsStatus: string | null;
}): boolean {
  // "skipped" = no relevance result (audit row); "skipped_optout" = unsubscribed.
  // Both are terminal for the week — re-running won't change them in 3 hours.
  const emailDone =
    d.emailStatus === "sent" || d.emailStatus === "skipped_optout" || d.emailStatus === "skipped";
  // smsStatus is null only on audit rows (paired with a terminal email skip);
  // "skipped" = not opted in. Neither is retryable.
  const smsDone = d.smsStatus == null || d.smsStatus === "sent" || d.smsStatus === "skipped";
  return emailDone && smsDone;
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

  // The digest week window is anchored to "Sunday 18:00 local" for the NSW
  // jurisdiction (Australia/Sydney), read from the registry config rather than
  // a hardcoded offset — DST-correct across AEST/AEDT (#28 timezone groundwork).
  const nswConfig = getJurisdictionConfig("nsw");
  const weekWindow = digestWeekWindow(nswConfig);

  // Idempotent resume (issue #12): the retry tick (Sun 10:00 UTC) must reuse
  // the primary tick's (Sun 07:00 UTC) DigestRun, not start a fresh one. Both
  // ticks share `cronWeekStartUtc`, so this finds the week's run if it exists.
  //
  // The lookup + create is also the concurrency guard (issue #93): the week key
  // is UNIQUE, so two overlapping invocations that both miss the findFirst can't
  // both create a run — the loser's create hits P2002 and re-reads the winner's
  // run. Without this the two invocations would run under different runIds and
  // the per-(user,run) Digest unique could never dedupe them.
  const weekStart = cronWeekStartUtc();
  let run = await db.digestRun.findFirst({ where: { weekKey: weekStart } });
  let resumed = run !== null;

  if (!run) {
    try {
      run = await db.digestRun.create({
        data: {
          runDate: new Date(),
          weekKey: weekStart,
          status: "running",
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      // A concurrent invocation just created this week's run — adopt it and
      // proceed as a resume (we'll only touch users it hasn't served yet).
      run = await db.digestRun.findFirstOrThrow({ where: { weekKey: weekStart } });
      resumed = true;
    }
  }

  if (resumed) {
    // Reopen the run for this pass (it was marked done/failed by the primary).
    await db.digestRun.update({
      where: { id: run.id },
      data: { status: "running", completedAt: null },
    });
  }

  log.info(
    {
      runId: run.id,
      resumed,
      timezone: nswConfig.timezone,
      weekStart: weekWindow.start.toISOString(),
      weekEnd: weekWindow.end.toISOString(),
    },
    resumed ? "[digest] cron resumed" : "[digest] cron started",
  );

  // Load active subscribers. Hard cap matches NFR-008 (≤ 100 active subs at
  // preview tier). At launch tier with > 100 subscribers, paginate this
  // query — the in-process digest loop wasn't designed for thousands of
  // users in a single Vercel function invocation.
  const users = await db.user.findMany({
    where: {
      emailVerified: true,
      // Entitlement gate (issue #87): an unexpired paid/trial WINDOW, not just
      // the status string — otherwise a self-signup trial (accessUntil:null, no
      // Stripe subscription) that never enters checkout gets the digest free
      // forever, because nothing ever transitions it off "trial".
      ...entitledDigestWhere(),
      // Issue #217 — channel-union pre-filter. A user who has unsubscribed from
      // email (emailOptIn:false) but opted into SMS with a mobile on file must
      // still be processed, because assembleAndSendDigest independently gates
      // each channel (email: skipped_optout, SMS: sent when smsOptIn && mobile).
      // Without this OR, such users are silently dropped — no SMS sent, no
      // unserved alert fires (they never entered the loop to fail).
      OR: [
        { emailOptIn: true },
        { smsOptIn: true, mobile_e164: { not: null } },
      ],
    },
    select: { id: true, email: true },
    take: 1000,
  });

  // Resume filter: skip users who already have a delivered digest for this
  // run. On the primary tick this set is empty (fresh run). On the retry tick
  // it holds everyone the primary served, so only the failed/never-attempted
  // users are re-processed — and a fully-successful week is a no-op.
  const priorDigests = await db.digest.findMany({
    where: { runId: run.id },
    select: { userId: true, emailStatus: true, smsStatus: true },
  });
  const completeUserIds = new Set(
    priorDigests.filter(isDigestComplete).map((d) => d.userId),
  );
  const pending = users.filter((u) => !completeUserIds.has(u.id));

  log.info(
    { runId: run.id, activeUsers: users.length, alreadyDelivered: completeUserIds.size, pending: pending.length },
    "[digest] resume filter applied",
  );

  let sent = 0;
  let failed = 0;

  for (const user of pending) {
    try {
      // Recovery source-of-truth (issue #196): if an earlier tick already
      // persisted this run's DA cards, they are immutable — rebuild the failed
      // channel(s) from them (assembleAndSendDigest with relevance=null) rather
      // than re-running the non-deterministic relevance pipeline, whose fresh
      // score could surface a different lead set or collapse to a quiet-week
      // "nothing strong" email while ≥5 real leads sit persisted in the portal.
      // Re-score ONLY when no cards were ever persisted: a fresh user on the
      // primary tick, or the issue #161 audit-stub backfill case.
      const hasPersistedCards =
        (await db.digestDa.count({
          where: { digest: { userId: user.id, runId: run.id } },
        })) > 0;

      let relevance: Awaited<ReturnType<typeof runRelevanceForUser>> = null;
      if (!hasPersistedCards) {
        relevance = await runRelevanceForUser(user.id, run.id);
        if (!relevance) {
          // Persist a Digest row anyway so observability queries can answer
          // "did Sunday work for everyone?" — null relevance means the user
          // is missing prerequisites (saved query embedding, LGAs, etc.).
          await recordAuditDigest(user.id, run.id, "skipped");
          log.warn({ userId: user.id }, "[digest] no relevance result — skipping user");
          continue;
        }
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
      await recordAuditDigest(user.id, run.id, "failed");
      log.error({ userId: user.id, err }, "[digest] unhandled error for user — continuing");
      Sentry.captureException(err, { tags: { userId: user.id, phase: "digest-user" } });
    }
  }

  const durationMs = Date.now() - startTime;

  // Recount over ALL of this run's rows (this pass + any prior tick) so a
  // per-channel retry is reflected: how many active users still lack a
  // delivered digest?
  const finalDigests = await db.digest.findMany({
    where: { runId: run.id },
    select: { userId: true, emailStatus: true, smsStatus: true },
  });
  const served = new Set(finalDigests.filter(isDigestComplete).map((d) => d.userId));
  const unserved = users.filter((u) => !served.has(u.id)).length;
  const status = users.length > 0 && served.size === 0 ? "failed" : "done";

  // Update DigestRun
  await db.digestRun.update({
    where: { id: run.id },
    data: {
      completedAt: new Date(),
      userCount: users.length,
      status,
    },
  });

  // Fail loud (issue #12, docs/01c-wedge — the digest is the highest-
  // availability code path). On the primary tick, leftover failures are
  // expected to be recovered by the retry tick (~3h later), so warn. On the
  // retry tick, leftover failures mean recovery FAILED — page with an error.
  if (unserved > 0) {
    if (resumed) {
      Sentry.captureMessage(
        `Digest retry left ${unserved}/${users.length} users unserved for run ${run.id}`,
        {
          level: "error",
          tags: { runId: run.id, phase: "digest-unserved", pass: "retry" },
        },
      );
    } else {
      Sentry.captureMessage(
        `Digest primary left ${unserved}/${users.length} users unserved (retry pending) for run ${run.id}`,
        {
          level: "warning",
          tags: { runId: run.id, phase: "digest-unserved", pass: "primary" },
        },
      );
    }
  }

  // NFR-001: alert if > 55 minutes
  if (durationMs > 55 * 60 * 1000) {
    Sentry.captureMessage(`Digest cron exceeded 55-minute SLA: ${durationMs / 1000}s`, {
      level: "warning",
      tags: { runId: run.id, phase: "digest-sla" },
    });
  }

  log.info({ runId: run.id, resumed, sent, failed, unserved, durationMs }, "[digest] cron complete");
  return { runId: run.id, resumed, usersProcessed: pending.length, sent, failed, unserved, durationMs };
}

/**
 * Write (or update) the per-user audit Digest row for a run without a full
 * send — for the "no relevance" and "hard failure" branches. Idempotent for
 * the retry tick: it updates the row the primary tick already left rather
 * than inserting a duplicate. Best-effort; never throws.
 */
async function recordAuditDigest(
  userId: string,
  runId: string,
  emailStatus: string,
): Promise<void> {
  try {
    const prior = await db.digest.findFirst({
      where: { userId, runId },
      select: { id: true },
    });
    if (prior) {
      await db.digest.update({ where: { id: prior.id }, data: { emailStatus } });
    } else {
      await db.digest.create({
        data: { userId, runId, daCount: 0, fallbackUsed: false, emailStatus },
      });
    }
  } catch {
    /* best-effort audit row */
  }
}
