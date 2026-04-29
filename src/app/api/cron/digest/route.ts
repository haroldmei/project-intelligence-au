// Vercel Cron handler — Sunday weekly digest
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Cron schedule (vercel.json entry):
//   "0 7 * * 0"  — every Sunday 07:00 UTC = 17:00 AEST (UTC+10, non-DST).
//
// AEST offset note:
//   Australia/Sydney observes AEST (UTC+10) in winter and AEDT (UTC+11) in summer (Oct–Apr).
//   The contract anchor is "Sunday 17:00 AEST = 07:00 UTC".
//   In AEDT, 07:00 UTC = 18:00 AEDT. Acceptable one-hour drift (contract explicitly uses AEST anchor).
//   Vercel Cron does not support timezone-aware schedules (it runs in UTC).
//
// FR-009 | system-design §5.1 cron schedule | contract.queue.weekly_cron | contract.deploy.cron_target
import { NextResponse } from "next/server";
import { withRetry, verifyCronSecret } from "@/lib/cron/retry";
import { runDigestCron } from "@/modules/digest/cron";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel max for serverless (5 min); digest for 100 users should be < 55 min

export async function POST(request: Request): Promise<NextResponse> {
  const authError = verifyCronSecret(request);
  if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await withRetry(() => runDigestCron(), {
      delayMs: 15 * 60 * 1000, // 15-min retry (NFR-022)
      label: "digest",
    });
    return NextResponse.json({
      users_processed: result.usersProcessed,
      sent: result.sent,
      failed: result.failed,
      run_id: result.runId,
      duration_ms: result.durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
