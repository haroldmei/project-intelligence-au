// Vercel Cron handler — daily verification reminder (FR-016, issue #130).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Cron schedule (vercel.json):
//   "0 5 * * *"  — daily 05:00 UTC = 15:00 AEST
//   FR-016 | system-design §9 activation gap
//
// The digest cron refuses to send to unverified accounts, so a signup that
// never enters its OTP silently receives nothing. This daily cron nudges each
// unverified account once, before the Thursday preceding its first expected
// Sunday digest. All timing + dedupe logic lives in the module.
import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/retry";
import { runVerificationReminderCron } from "@/modules/onboarding/verification-reminder";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronSecret(request);
  if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runVerificationReminderCron();
  return NextResponse.json(result);
}
