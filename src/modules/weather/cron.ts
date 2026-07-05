// Storm-brief cron orchestrator (#20). Fetches BOM severe-weather warnings,
// matches them to subscribers' LGAs, and emails a one-off "storm brief" — at
// most once per (warning, user). No-op when STORM_BRIEF_ENABLED is off.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// CADENCE: the intended schedule is every 3 hours (`0 */3 * * *`) so a warning
// issued mid-morning reaches subbies while it's still actionable. Vercel's
// Hobby plan (#84) caps crons at once-per-day, so vercel.json runs this daily
// (`0 20 * * *` = 06:00 AEST). The handler is idempotent per warning-id (the
// StormBrief unique constraint below), so restoring the 3-hourly cadence on a
// Pro upgrade is a one-line vercel.json revert — no code change here.
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { entitledDigestWhere } from "@/modules/billing/entitlement";
import { sendEmail } from "@/lib/email/client";
import { buildListUnsubscribeHeaders } from "@/lib/email/list-unsubscribe";
import { issueUnsubscribeToken } from "@/lib/hmac/token";
import { fetchStormWarnings, isStormBriefEnabled } from "./feed";
import { selectBriefs, briefKey, type StormBriefUser } from "./select";
import { lgaNames } from "./lgas";
import pino from "pino";

const log = pino({ name: "storm-brief" });

export interface StormBriefCronResult {
  /** True when the feature flag is off — cron did no work. */
  skipped: boolean;
  /** Severe warnings parsed from the feed. */
  warnings: number;
  /** Briefs actually emailed this run. */
  sent: number;
  /** Sends that errored (dedupe row already committed, so no re-send). */
  failed: number;
}

const SKIPPED: StormBriefCronResult = { skipped: true, warnings: 0, sent: 0, failed: 0 };

/** Format a UTC instant as a Sydney-local issue time, DST-correct. */
function formatIssuedAt(issuedAt: Date | null): string | null {
  if (!issuedAt) return null;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(issuedAt);
}

/**
 * Main storm-brief entrypoint. Idempotent at the (warning, user) grain via the
 * StormBrief unique constraint: the dedupe row is committed BEFORE the send, so
 * a warning that stays live across several 3-hourly ticks re-briefs nobody. The
 * trade-off is that a transient email failure drops that one brief rather than
 * risking a duplicate — deliberate, since a double storm brief is worse than a
 * missed one (the acceptance is "exactly one brief per affected user").
 */
export async function runStormBriefCron(): Promise<StormBriefCronResult> {
  // Flag off → no feed fetch, no send. Cheapest possible no-op.
  if (!isStormBriefEnabled()) {
    log.info("[storm-brief] STORM_BRIEF_ENABLED off — skipping");
    return SKIPPED;
  }

  const warnings = await fetchStormWarnings();
  if (warnings.length === 0) {
    log.info("[storm-brief] no severe warnings in feed");
    return { skipped: false, warnings: 0, sent: 0, failed: 0 };
  }

  // Opted-in subscribers with their subscribed LGA ids (via bundles). ANDs the
  // per-user storm-brief toggle with the Spam Act email opt-out.
  const users = await db.user.findMany({
    where: {
      emailVerified: true,
      // Entitlement gate (issue #87): an unexpired paid/trial window, not just
      // the status string — an expired self-signup trial must not keep getting
      // the paid storm brief for free. Shared with the digest cron.
      ...entitledDigestWhere(),
      emailOptIn: true,
      stormBriefOptIn: true,
    },
    select: {
      id: true,
      email: true,
      lgaBundles: { select: { bundle: { select: { lgas: { select: { id: true } } } } } },
    },
    take: 1000,
  });

  const briefUsers: StormBriefUser[] = users
    .map((u) => ({
      id: u.id,
      email: u.email,
      subscribedLgaIds: u.lgaBundles.flatMap((s) => s.bundle.lgas.map((l) => l.id)),
    }))
    .filter((u) => u.subscribedLgaIds.length > 0);

  // Preload already-sent (warning, user) pairs so a re-run doesn't re-brief.
  const warningIds = warnings.map((w) => w.id);
  const sentRows = await db.stormBrief.findMany({
    where: { warningId: { in: warningIds } },
    select: { warningId: true, userId: true },
  });
  const alreadySent = new Set(sentRows.map((r) => briefKey(r.warningId, r.userId)));

  const tasks = selectBriefs({ warnings, users: briefUsers, alreadySent });
  log.info(
    { warnings: warnings.length, subscribers: briefUsers.length, tasks: tasks.length },
    "[storm-brief] selection complete",
  );

  const appUrl = env.NEXT_PUBLIC_APP_URL;
  let sent = 0;
  let failed = 0;

  for (const task of tasks) {
    // Commit the dedupe row FIRST. A unique-violation means a concurrent tick
    // already claimed this (warning, user) — skip without sending.
    try {
      await db.stormBrief.create({
        data: { warningId: task.warning.id, userId: task.user.id },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") continue;
      throw err;
    }

    try {
      const names = lgaNames(task.matchedLgaIds);
      const unsubscribeUrl = `${appUrl}/api/unsubscribe/${encodeURIComponent(issueUnsubscribeToken(task.user.id))}`;
      await sendEmail({
        to: task.user.email,
        template: "storm-brief",
        // RFC-8058 one-click unsubscribe on the storm-brief bulk blast too
        // (issue #179): POST-only opt-out, prefetch-GET-safe.
        headers: buildListUnsubscribeHeaders(unsubscribeUrl),
        props: {
          warningTitle: task.warning.title,
          areasLabel: task.warning.areas[0] ?? names.join(", "),
          lgaNames: names,
          issuedAtLabel: formatIssuedAt(task.warning.issuedAt),
          warningUrl: task.warning.url,
          manageUrl: `${appUrl}/account/storm-brief`,
          unsubscribeUrl,
        },
      });
      sent++;
      log.info({ userId: task.user.id, warningId: task.warning.id }, "[storm-brief] sent");
    } catch (err) {
      failed++;
      log.error(
        { userId: task.user.id, warningId: task.warning.id, err },
        "[storm-brief] send failed (dedupe row kept — no re-send)",
      );
    }
  }

  return { skipped: false, warnings: warnings.length, sent, failed };
}
