// Vercel Cron handler — daily "your card is charged in ~2 days" trial reminder.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Cron schedule (vercel.json):
//   "0 6 * * *"  — daily 06:00 UTC = 16:00 AEST
//   FR-028 | system-design §9 gap-3
//
// The reminder anchors on the REAL billing deadline — accessUntil (the Stripe
// trial_end, set by the webhook from current_period_end) — NOT on account age
// (issue #128). Anchoring on createdAt was wrong for two cohorts:
//   (a) subscribers who checked out days after signup — their Stripe trial_end
//       is (checkout-delay + 2) days out, so a day-26-of-account "card charged
//       in 2 days" email is premature and factually wrong; and
//   (b) self-signup trials that never entered checkout — accessUntil:null,
//       stripeCustomerId:null, NO card — an account-age reminder tells them a
//       card that does not exist "will be charged AUD 99".
// So we only remind a user who has a Stripe-managed trial (stripeCustomerId +
// accessUntil) whose accessUntil falls inside the next REMINDER_WINDOW_DAYS,
// and we derive daysLeft from accessUntil. Users with no card are never sent
// this email — there is nothing to be charged.
import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/retry";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/client";
import { issueUnsubscribeToken } from "@/lib/hmac/token";
import { env } from "@/lib/env";
import pino from "pino";

const log = pino({ name: "trial-reminder" });

export const runtime = "nodejs";
export const maxDuration = 60;

const MS_PER_DAY = 86_400_000;
const REMINDER_WINDOW_DAYS = 2; // remind when the card is charged within 2 days

export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronSecret(request);
  if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Anchor on the actual charge date (accessUntil = Stripe trial_end), not
  // account age. Eligible = a Stripe-managed trial (stripeCustomerId AND
  // accessUntil non-null) whose accessUntil lands inside the next
  // REMINDER_WINDOW_DAYS. The `gt: now`/`lte: windowEnd` range implicitly
  // excludes accessUntil:null (a self-signup trial with no card), so those
  // users are never told a nonexistent card will be charged.
  //
  // Deliberately NOT entitledDigestWhere(): that fragment also matches
  // `active` subscribers, whose accessUntil is a monthly renewal date that can
  // fall inside a 2-day window near renewal — they'd wrongly get a "trial ends,
  // card will be charged AUD 99" email. This reminder is only the trial→first-
  // charge nudge, so it gates strictly on the trial status.
  //
  // The 2-day window (rather than an exact day) means a missed cron tick still
  // sends late rather than dropping the reminder; trialReminderSentAt dedupes
  // regardless of the window — at most one send per user.
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * MS_PER_DAY);

  // Deliberately NOT gated on emailOptIn (issue #127). This is the ONLY
  // pre-charge warning a trialer gets before the day-28 auto-charge, so it is
  // transactional — same class as the payment-failed dunning email, which also
  // ignores emailOptIn. The one-tap digest unsubscribe flips a single global
  // emailOptIn flag; suppressing this notice on that flag would auto-charge a
  // user who only meant to mute the weekly digest, with zero prior warning — a
  // trust and chargeback/dispute risk. The Spam Act 2003 permits a factual
  // notice about a transaction the recipient has entered into; marketing sends
  // (the weekly digest) still honour emailOptIn.
  const users = await db.user.findMany({
    where: {
      subscriptionStatus: "trial",
      stripeCustomerId: { not: null },
      accessUntil: { gt: now, lte: windowEnd },
      trialReminderSentAt: null,
    },
    select: { id: true, email: true, accessUntil: true },
    take: 1000, // bounded daily cohort; matches NFR-008 ceiling
  });

  const manageBillingUrl = `${env.NEXT_PUBLIC_APP_URL}/account`;
  let reminded = 0;
  for (const user of users) {
    // Derive daysLeft from the real charge date. accessUntil is guaranteed
    // non-null and in (now, windowEnd] by the query above; round up so a
    // deadline ~1.5 days out reads "2 days", never "0".
    const daysLeft = Math.max(
      1,
      Math.ceil((user.accessUntil!.getTime() - now.getTime()) / MS_PER_DAY),
    );
    try {
      await sendEmail({
        to: user.email,
        template: "trial-reminder",
        props: {
          daysLeft,
          manageBillingUrl,
          // Per-user token link — functional, no-login unsubscribe.
          unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/api/unsubscribe/${encodeURIComponent(issueUnsubscribeToken(user.id))}`,
        },
      });
      // Mark sent BEFORE the next user so a function-timeout mid-loop
      // can't re-deliver to the same user on retry.
      await db.user.update({
        where: { id: user.id },
        data: { trialReminderSentAt: new Date() },
      });
      reminded++;
      log.info({ userId: user.id }, "[trial-reminder] sent");
    } catch (err) {
      log.error({ userId: user.id, err }, "[trial-reminder] send failed");
    }
  }

  return NextResponse.json({ reminded });
}
