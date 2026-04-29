// Vercel Cron handler — daily trial-reminder on day 12
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Cron schedule (vercel.json):
//   "0 6 * * *"  — daily 06:00 UTC = 16:00 AEST
//   FR-028 | system-design §9 gap-3
import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/retry";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/client";
import { env } from "@/lib/env";
import pino from "pino";

const log = pino({ name: "trial-reminder" });

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const authError = verifyCronSecret(request);
  if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const day12cutoff = new Date();
  day12cutoff.setDate(day12cutoff.getDate() - 12);
  const day13cutoff = new Date();
  day13cutoff.setDate(day13cutoff.getDate() - 13);

  // Users who signed up 12 days ago and are still on trial (FR-028)
  const users = await db.user.findMany({
    where: {
      subscriptionStatus: "trial",
      createdAt: { gte: day13cutoff, lte: day12cutoff },
    },
    select: { id: true, email: true },
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
      reminded++;
      log.info({ userId: user.id }, "[trial-reminder] sent");
    } catch (err) {
      log.error({ userId: user.id, err }, "[trial-reminder] send failed");
    }
  }

  return NextResponse.json({ reminded });
}
