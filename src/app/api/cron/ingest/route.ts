// Vercel Cron handler — nightly ingestion
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Cron schedule (vercel.json):
//   "0 13 * * *"   — daily 13:00 UTC = 23:00 AEST (UTC+10)
//   AEST is UTC+10 (non-daylight-saving); Sydney observes AEDT (UTC+11) in summer.
//   For the nightly cron, 13:00 UTC lands at 23:00 AEST / 00:00 AEDT — acceptable drift.
//
// Contract: deploy.cron_target = vercel-cron (system-design §5.1)
// Auth: Vercel Cron secret header (contract.security.secrets_manager: gcp-secret-manager)
import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/retry";
import { runIngest } from "@/modules/ingestion/ingest";

export const runtime = "nodejs";
export const maxDuration = 300; // 5-minute limit for nightly fetch of 15 LGAs

export async function POST(request: Request): Promise<NextResponse> {
  const authError = verifyCronSecret(request);
  if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // In-process retry was removed — Vercel function timeout (300s) is
    // shorter than the previous 2-min sleep + retry, so it was a no-op.
    // A failed ingest surfaces as 500 + Sentry; the next daily tick retries.
    const result = await runIngest(1);
    return NextResponse.json({
      ingested: result.totalIngested,
      failed: result.totalFailed,
      perCouncil: result.results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
