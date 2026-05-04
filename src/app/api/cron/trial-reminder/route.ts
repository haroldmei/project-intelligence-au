// Vercel Cron handler — daily trial-reminder on day 26 of a 28-day trial.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Cron schedule (vercel.json):
//   "0 6 * * *"  — daily 06:00 UTC = 16:00 AEST
//   FR-028 | system-design §9 gap-3
//
// Trial length: 28 days (see src/modules/billing/stripe.ts). Reminder fires
// on day 26 — 2 days before the card is charged. Mid-trial check-in
// (day 14, "you're halfway through, here's how to give thumbs feedback")
// is a future iteration.
import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/retry";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/client";
import { env } from "@/lib/env";
import pino from "pino";

const log = pino({ name: "trial-reminder" });

export const runtime = "nodejs";
export const maxDuration = 60;

const REMINDER_DAY = 26; // 2 days before 28-day trial ends

export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronSecret(request);
  if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Eligibility window: account is at least REMINDER_DAY days old (so the
  // user is genuinely on day 26+) but reminder hasn't been sent yet.
  // Wider window than `[day26, day27]` so a missed cron run still sends
  // late rather than dropping the reminder entirely. trialReminderSentAt
  // dedupes regardless of the window — at most one send per user.
  const eligibleCreatedBefore = new Date();
  eligibleCreatedBefore.setDate(eligibleCreatedBefore.getDate() - REMINDER_DAY);

  const users = await db.user.findMany({
    where: {
      subscriptionStatus: "trial",
      createdAt: { lte: eligibleCreatedBefore },
      trialReminderSentAt: null,
    },
    select: { id: true, email: true },
    take: 1000, // bounded daily cohort; matches NFR-008 ceiling
  });

  const manageBillingUrl = `${env.NEXT_PUBLIC_APP_URL}/account`;
  let reminded = 0;
  for (const user of users) {
    try {
      await sendEmail({
        to: user.email,
        template: "trial-reminder",
        props: { daysLeft: 2, manageBillingUrl },
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
