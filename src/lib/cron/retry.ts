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
// level — schedule the cron more often than needed (weekly digest fires a
// primary tick Sun 07:00 UTC and a retry tick Sun 10:00 UTC), idempotency-
// keyed on the week. Both ticks resolve to the SAME DigestRun via
// `cronWeekStartUtc`, so the retry only re-processes users the primary left
// unserved. A failed primary tick gets recovered by the retry tick; the
// resume logic lives in src/modules/digest/cron.ts.
//
// Nightly ingestion has the same shape (issue #125): a per-LGA transient
// upstream failure can't be re-fired in-process, so `retryFailedIngest` is
// called inline at the end of the nightly `/api/cron/ingest` handler to re-fetch
// just the unrecovered failures, scoped to the run window via
// `mostRecentNightlyIngestUtc`. The recovery logic lives in
// `retryFailedIngest` in src/modules/ingestion/ingest.ts.
import { env } from "@/lib/env";

/** Verify the Vercel Cron secret header. Returns 401 Response if invalid. */
export function verifyCronSecret(request: Request): Response | null {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  return null;
}

/**
 * Stable week key for cron idempotency: the UTC instant of the most recent
 * Sunday 00:00. Both the primary (Sun 07:00 UTC) and retry (Sun 10:00 UTC)
 * digest ticks fall on the same UTC Sunday, so they compute the identical
 * boundary — letting the handler find and resume the one DigestRun for the
 * week rather than starting a fresh one on the retry.
 *
 * Deliberately NOT `digestWeekWindow().end`: that anchor is 18:00 local
 * (08:00 UTC), which sits BETWEEN the two ticks — so it would resolve to
 * different weeks for the 07:00 and 10:00 fires and defeat the dedupe.
 */
export function cronWeekStartUtc(now: Date = new Date()): Date {
  const dow = now.getUTCDay(); // 0 = Sunday
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow, 0, 0, 0, 0),
  );
}

/** UTC hour of the nightly ingestion cron (vercel.json: `0 13 * * *`). */
export const NIGHTLY_INGEST_UTC_HOUR = 13;

/**
 * The UTC instant of the most recent nightly-ingest fire (13:00 UTC) at or
 * before `now`. Used by the inline ingest retry pass (issue #125) to
 * scope "which councils failed tonight" to the current night's run — a failure
 * written at Sat 13:00 UTC stays in-window for every hourly retry tick right up
 * to the Sunday 07:00 UTC digest, and correctly rolls to the new boundary once
 * the next nightly tick fires. Handrolled (not a calendar-day floor) so the
 * window spans UTC midnight rather than resetting at 00:00 UTC mid-night.
 */
export function mostRecentNightlyIngestUtc(now: Date = new Date()): Date {
  const boundary = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      NIGHTLY_INGEST_UTC_HOUR,
      0,
      0,
      0,
    ),
  );
  // Before 13:00 UTC today, the most recent nightly run was yesterday's.
  if (boundary.getTime() > now.getTime()) boundary.setUTCDate(boundary.getUTCDate() - 1);
  return boundary;
}
