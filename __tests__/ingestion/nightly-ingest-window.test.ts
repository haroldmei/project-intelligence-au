// Unit tests for mostRecentNightlyIngestUtc — the run-window boundary the
// inline ingest retry pass uses to scope "which councils failed tonight" (issue #125).
//
// The boundary must span UTC midnight rather than reset at 00:00 UTC: the
// nightly ingest fires 13:00 UTC (Sat), and its failures must stay in-window for
// every hourly retry tick right up to the Sunday 07:00 UTC digest.
import { describe, it, expect } from "vitest";
import { mostRecentNightlyIngestUtc, NIGHTLY_INGEST_UTC_HOUR } from "@/lib/cron/retry";

describe("mostRecentNightlyIngestUtc", () => {
  it("returns today's 13:00 UTC when now is after the nightly fire", () => {
    const now = new Date(Date.UTC(2026, 6, 4, 14, 15, 0)); // Sat 14:15 UTC
    const b = mostRecentNightlyIngestUtc(now);
    expect(b.toISOString()).toBe("2026-07-04T13:00:00.000Z");
  });

  it("rolls back to yesterday's 13:00 UTC when now is before today's fire", () => {
    const now = new Date(Date.UTC(2026, 6, 5, 6, 15, 0)); // Sun 06:15 UTC (pre-digest)
    const b = mostRecentNightlyIngestUtc(now);
    // A Saturday-night failure (Sat 13:00 UTC) is still inside this window.
    expect(b.toISOString()).toBe("2026-07-04T13:00:00.000Z");
  });

  it("keeps a Sat-night failure in-window across UTC midnight through to the Sun digest", () => {
    const failure = new Date(Date.UTC(2026, 6, 4, 13, 5, 0)); // Sat 13:05 UTC ingest failure
    // Every hourly retry tick from just after the failure to just before the
    // Sunday 07:00 UTC digest keeps the failure inside the window.
    for (const now of [
      new Date(Date.UTC(2026, 6, 4, 14, 15, 0)), // Sat 14:15
      new Date(Date.UTC(2026, 6, 4, 23, 15, 0)), // Sat 23:15
      new Date(Date.UTC(2026, 6, 5, 0, 15, 0)), // Sun 00:15 (past UTC midnight)
      new Date(Date.UTC(2026, 6, 5, 6, 15, 0)), // Sun 06:15 (before digest)
    ]) {
      expect(mostRecentNightlyIngestUtc(now).getTime()).toBeLessThanOrEqual(failure.getTime());
    }
  });

  it("uses the nightly-ingest UTC hour registered in vercel.json (0 13 * * *)", () => {
    expect(NIGHTLY_INGEST_UTC_HOUR).toBe(13);
  });
});
