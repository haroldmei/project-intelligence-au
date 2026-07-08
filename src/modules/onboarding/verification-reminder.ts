// Verification-reminder cron service (FR-016, issue #130).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// The digest cron gates on emailVerified:true (src/modules/digest/cron.ts), so
// a signup that never enters its OTP receives NO digest — and, before this
// service, no nudge either. The trial clock keeps running, so the account can
// churn through its whole 28-day trial having never seen the product.
//
// FR-016: "If email is not verified by the Thursday before the first expected
// Sunday digest, a reminder email is sent." This service runs daily, selects
// unverified opted-in accounts whose Thursday cutoff has arrived, sends the
// reminder once, and dedupes on verificationReminderSentAt.
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/client";
import { issueUnsubscribeToken } from "@/lib/hmac/token";
import { env } from "@/lib/env";
import pino from "pino";

const log = pino({ name: "verification-reminder" });

export interface VerificationReminderResult {
  /** Accounts that matched the boolean/dedupe filter and were examined. */
  candidates: number;
  /** Accounts past their Thursday cutoff that were reminded this run. */
  reminded: number;
}

/**
 * The reminder cutoff for an account created at `createdAt`: the start (00:00
 * UTC) of the Thursday preceding its FIRST expected Sunday digest.
 *
 * The digest cron fires every Sunday 07:00 UTC (vercel.json). An account's
 * first receivable digest is the earliest Sunday-07:00-UTC at or after signup
 * (the digest has no minimum-account-age gate — a Friday signup is eligible for
 * that Sunday). FR-016 places the reminder on the Thursday before that Sunday.
 *
 * Late-week signups (Thu/Fri/Sat) have already passed the Thursday for the
 * coming Sunday, so their cutoff sits at or before signup — they become due on
 * the next daily cron tick, which is the correct "nudge before Sunday" outcome
 * rather than dropping the reminder.
 */
export function verificationReminderCutoff(createdAt: Date): Date {
  // Walk forward to the first Sunday 07:00 UTC that is >= createdAt.
  const sunday = new Date(
    Date.UTC(
      createdAt.getUTCFullYear(),
      createdAt.getUTCMonth(),
      createdAt.getUTCDate(),
      7,
      0,
      0,
      0,
    ),
  );
  while (sunday.getUTCDay() !== 0 || sunday.getTime() < createdAt.getTime()) {
    sunday.setUTCDate(sunday.getUTCDate() + 1);
  }
  // Thursday before that Sunday = Sunday - 3 days, anchored to 00:00 UTC so any
  // cron tick on that Thursday (or later) counts as "at or after the cutoff".
  return new Date(
    Date.UTC(
      sunday.getUTCFullYear(),
      sunday.getUTCMonth(),
      sunday.getUTCDate() - 3,
      0,
      0,
      0,
      0,
    ),
  );
}

/**
 * Send the verification reminder to every eligible unverified account.
 *
 * Eligible = email not verified, still opted in (Spam Act 2003), not yet
 * reminded, AND at or past its Thursday cutoff. The stamp is written BEFORE
 * moving to the next user so a function-timeout mid-loop can't re-deliver.
 *
 * `now` is injectable for tests; production passes the wall clock.
 */
export async function runVerificationReminderCron(
  now: Date = new Date(),
): Promise<VerificationReminderResult> {
  // The precise "Thursday before the first Sunday" test is per-account (it
  // depends on createdAt's weekday), so we filter the cheap boolean/dedupe
  // predicates in the query and apply the cutoff in-app. Bounded by NFR-008
  // (≤ 100 active subs at preview tier); take is a safety ceiling.
  const candidates = await db.user.findMany({
    where: {
      emailVerified: false,
      // Spam Act 2003: don't email a user who has unsubscribed.
      emailOptIn: true,
      // Dedupe: at most one verification reminder per account, ever.
      verificationReminderSentAt: null,
    },
    select: { id: true, email: true, createdAt: true },
    take: 1000,
  });

  const due = candidates.filter(
    (u) => verificationReminderCutoff(u.createdAt).getTime() <= now.getTime(),
  );

  const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/login`;
  let reminded = 0;
  for (const user of due) {
    try {
      await sendEmail({
        to: user.email,
        template: "verification-reminder",
        props: {
          verifyUrl,
          // Per-user token link — functional, no-login unsubscribe.
          unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/api/unsubscribe/${encodeURIComponent(issueUnsubscribeToken(user.id))}`,
        },
      });
      // Mark sent BEFORE the next user so a function-timeout mid-loop can't
      // re-deliver to the same account on retry.
      await db.user.update({
        where: { id: user.id },
        data: { verificationReminderSentAt: now },
      });
      reminded++;
      log.info({ userId: user.id }, "[verification-reminder] sent");
    } catch (err) {
      log.error({ userId: user.id, err }, "[verification-reminder] send failed");
    }
  }

  log.info(
    { candidates: candidates.length, due: due.length, reminded },
    "[verification-reminder] cron complete",
  );
  return { candidates: candidates.length, reminded };
}
