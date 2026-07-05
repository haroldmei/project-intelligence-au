// Vercel Cron handler — compensating ingestion retry (issue #125)
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Cron schedule (vercel.json):
//   "15 * * * *"  — hourly, at :15. The design-specified secondary control
//                   (system-design §3.3/§5.1): Vercel Cron cannot dynamically
//                   re-fire a failed job, so a separate hourly poll re-checks
//                   ingestion_log for the current night's failed LGAs and
//                   re-runs JUST those. This heals a Saturday-night transient
//                   ePlanning failure before the Sunday 07:00 UTC (17:00 AEST)
//                   digest reads that LGA's DAs — the nightly ingest itself does
//                   NOT retry (its next tick is ~24h away, after the digest).
//
// retryFailedIngest() is idempotent and a no-op when nothing failed / everything
// recovered, so the every-hour cadence is cheap on the common (healthy) night.
//
// Contract: deploy.cron_target = vercel-cron (system-design §5.1)
// Auth: Vercel Cron secret header (contract.security.secrets_manager: gcp-secret-manager)
import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/retry";
import { retryFailedIngest } from "@/modules/ingestion/ingest";

export const runtime = "nodejs";
export const maxDuration = 300; // 5-minute limit; a retry pass touches only the failed LGAs

export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronSecret(request);
  if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await retryFailedIngest(1);
    return NextResponse.json({
      retried: result.retriedCouncils,
      ingested: result.totalIngested,
      failed: result.totalFailed,
      perCouncil: result.results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
