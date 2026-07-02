// Vercel Cron handler — Sunday weekly digest
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Cron schedule (vercel.json entries):
//   "0 7 * * 0"   — primary, every Sunday 07:00 UTC = 17:00 AEST (UTC+10, non-DST).
//   "0 10 * * 0"  — retry, ~3h later (Sunday 10:00 UTC). Same handler, same auth.
//                   runDigestCron() is idempotent-resumable (issue #12): the retry
//                   only re-processes users the primary left unserved, and is a
//                   no-op after a fully-successful primary run.
//
// AEST offset note:
//   Australia/Sydney observes AEST (UTC+10) in winter and AEDT (UTC+11) in summer (Oct–Apr).
//   The contract anchor is "Sunday 17:00 AEST = 07:00 UTC".
//   In AEDT, 07:00 UTC = 18:00 AEDT. Acceptable one-hour drift (contract explicitly uses AEST anchor).
//   Vercel Cron does not support timezone-aware schedules (it runs in UTC).
//
// FR-009 | system-design §5.1 cron schedule | contract.queue.weekly_cron | contract.deploy.cron_target
import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/retry";
import { runDigestCron } from "@/modules/digest/cron";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel max for serverless (5 min); digest for 100 users should be < 55 min

export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronSecret(request);
  if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // No in-process retry — the previous 15-min sleep would always be killed
    // by Vercel's 5-min function timeout. Recovery is at the cron-tick level
    // instead: a second scheduled tick (Sun 10:00 UTC) re-invokes this handler,
    // and runDigestCron() resumes the same run, processing only the users the
    // primary left unserved (issue #12).
    const result = await runDigestCron();
    return NextResponse.json({
      resumed: result.resumed,
      users_processed: result.usersProcessed,
      sent: result.sent,
      failed: result.failed,
      unserved: result.unserved,
      run_id: result.runId,
      duration_ms: result.durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
