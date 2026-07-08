// Vercel Cron handler — nightly ingestion
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Cron schedule (vercel.json):
//   "0 13 * * *"   — daily 13:00 UTC = 23:00 AEST (UTC+10)
//   AEST is UTC+10 (non-daylight-saving); Sydney observes AEDT (UTC+11) in summer.
//   For the nightly cron, 13:00 UTC lands at 23:00 AEST / 00:00 AEDT — acceptable drift.
//
// Inline compensating retry: after the main fetch and PCC linking, retryFailedIngest
// re-fetches any LGAs that failed during this run so a transient Saturday-night
// failure is healed before the Sunday digest. No separate /api/cron/ingest-retry cron.
//
// Contract: deploy.cron_target = vercel-cron (system-design §5.1)
// Auth: Vercel Cron secret header (contract.security.secrets_manager: gcp-secret-manager)
import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/retry";
import { runIngest, retryFailedIngest } from "@/modules/ingestion/ingest";
import { runPccIngest } from "@/modules/ingestion/pcc-ingest";

export const runtime = "nodejs";
export const maxDuration = 300; // 5-minute limit for nightly fetch of 15 LGAs

export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronSecret(request);
  if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await runIngest(1);

    // Link the day's Construction Certificates to their DAs (issue #13). Runs
    // AFTER the DA ingest so the DAs a CC references already exist. No-ops
    // (skipped) unless PCC_INGEST_ENABLED + NSW_PLANNING_API_KEY are both set,
    // so this is inert until the feed is switched on. One CC council failing is
    // isolated inside runPccIngest and never fails the DA ingest.
    const pcc = await runPccIngest(1);

    // Inline compensating retry (issue #125): re-fetch any LGAs that failed
    // during this run so a transient upstream failure is healed before the
    // Sunday digest reads that LGA's DAs. Idempotent and self-limiting — a
    // no-op on a healthy night.
    const retry = await retryFailedIngest(1);

    return NextResponse.json({
      ingested: result.totalIngested,
      failed: result.totalFailed,
      perCouncil: result.results,
      retry: {
        retriedCouncils: retry.retriedCouncils,
        ingested: retry.totalIngested,
        failed: retry.totalFailed,
      },
      pcc: { linked: pcc.linked, unmatched: pcc.unmatched, skipped: pcc.skipped },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
