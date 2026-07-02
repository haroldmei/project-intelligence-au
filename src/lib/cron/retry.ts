// Cron secret verification.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// HISTORICAL — withRetry() was previously exported here and wrapped a cron
// handler with "wait 15 minutes then retry once". It was a no-op in
// practice: Vercel's serverless maxDuration is 5 minutes, so the 15-minute
// in-process sleep was always killed by the function timeout before the
// second attempt could run. NFR-022's "15-min retry" promise was never
// actually delivered.
//
// The correct retry pattern for Vercel cron is to dedupe at the cron-tick
// level — schedule the cron more often than needed (e.g. weekly cron run
// daily, idempotency-keyed on week-of-year). A failed tick gets caught by
// the next tick. That's a separate iteration; until then crons run once
// per schedule and a failure is logged + Sentry-captured by the caller.
import { env } from "@/lib/env";

/** Verify the Vercel Cron secret header. Returns 401 Response if invalid. */
export function verifyCronSecret(request: Request): Response | null {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  return null;
}
