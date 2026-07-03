// Vercel Cron handler — mid-week storm brief from BOM severe-weather warnings (#20).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Cron schedule (vercel.json):
//   "0 20 * * *"  — daily 20:00 UTC (06:00 AEST). The intended cadence is
//   3-hourly (BOM severe-weather warnings are short-lived), but Vercel's Hobby
//   plan caps crons at once/day (#84); the StormBrief unique constraint keeps
//   it idempotent per warning so restoring 3-hourly is a one-line vercel.json
//   revert. See src/modules/weather/cron.ts and docs/19-deploy-runbook.md.
//
// No-op when STORM_BRIEF_ENABLED is off (default until dogfooded, docs/24 §4).
// Auth: standard Vercel Cron secret header (same as digest/ingest/trial-reminder).
import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/retry";
import { runStormBriefCron } from "@/modules/weather/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronSecret(request);
  if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await runStormBriefCron();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
