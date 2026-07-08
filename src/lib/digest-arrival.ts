// Digest arrival time computation — FR-015 §3.4.
//
// The weekly digest fires every Sunday at 18:00 Sydney time.
// The onboarding reassurance must say "this Sunday" when ≥ 60 hours remain
// before the next digest, and "next Sunday" when < 60 hours remain.
//
// Pure module: no DB, no @/lib/env, no React. Safe in both server and client
// components, and in jsdom tests.

const DIGEST_HOUR = 18; // 6 pm Sydney time
const CUTOFF_HOURS = 60;
const SCANNING_REASSURANCE =
  "we're already scanning 15 Sydney LGAs for re-roof DAs";

export interface DigestArrival {
  /** "this" or "next" — the relative qualifier for the upcoming digest Sunday. */
  prefix: "this" | "next";
  /**
   * Formatted date string for the digest Sunday, e.g. "Sunday, 13 July 2026".
   * Produced via Intl.DateTimeFormat with the Australia/Sydney timezone and
   * the en-AU locale (weekday + day + month + year).
   */
  dateStr: string;
  /**
   * Complete FR-015 reassurance string, e.g.
   * "Your first digest will arrive this Sunday, 13 July 2026 at 6 pm — we're
   * already scanning 15 Sydney LGAs for re-roof DAs."
   */
  full: string;
}

/**
 * Compute the digest arrival info for a given moment.
 *
 * @param now - The reference time (defaults to `new Date()`). Pass a fixed
 *   Date in tests to control which branch is taken.
 */
export function getDigestArrival(now?: Date): DigestArrival {
  const _now = now ?? new Date();
  const utcMs = _now.getTime();

  // ── Read current time in the Australia/Sydney timezone ──────────────
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = fmt.formatToParts(_now);
  const getInt = (type: string): number => {
    const p = parts.find((part) => part.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };

  const year = getInt("year");
  const month = getInt("month") - 1; // 0-indexed
  const day = getInt("day");
  const hour = getInt("hour");
  const minute = getInt("minute");

  // ── Sydney offset from UTC at the current moment ───────────────────
  // Sydney is east of UTC, so the offset is positive (e.g. +10h AEST).
  const sydneyOffsetMs =
    Date.UTC(year, month, day, hour, minute, 0, 0) - utcMs;

  // ── Day of week in Sydney (0 = Sunday) ─────────────────────────────
  // Date.UTC(sydney-date) and the actual Sydney date share the same
  // calendar day because Sydney is always ahead of UTC.
  const dow = new Date(Date.UTC(year, month, day)).getUTCDay();

  // ── Days until next Sunday 18:00 Sydney time ───────────────────────
  const daysUntil =
    dow === 0 && (hour < DIGEST_HOUR || (hour === DIGEST_HOUR && minute === 0))
      ? 0 // digest fires later today
      : dow === 0
        ? 7 // digest already passed today → next week
        : 7 - dow;

  // ── UTC timestamp of next Sunday 18:00 Sydney time ─────────────────
  const nextDigestUtcMs =
    Date.UTC(year, month, day + daysUntil, DIGEST_HOUR, 0, 0, 0) -
    sydneyOffsetMs;

  // ── Cutoff check (FR-015) ──────────────────────────────────────────
  //
  // If fewer than 60 hours remain before the next digest, the subscriber may
  // not be included in this week's pipeline, so we promise the *following*
  // Sunday instead.  This covers the Friday/Saturday (and late Sunday morning)
  // signup window where pipeline processing has already run or won't include
  // a newly-provisioned subscriber.
  const hoursUntil = (nextDigestUtcMs - utcMs) / (1000 * 60 * 60);
  const prefix = hoursUntil < CUTOFF_HOURS ? ("next" as const) : ("this" as const);

  // ── Format the digest Sunday for the message ───────────────────────
  // When prefix is "next" the promise refers to the digest *after* the
  // upcoming one — add 7 days so the formatted date matches the promise.
  const dateStr = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(nextDigestUtcMs + (prefix === "next" ? 7 * 24 * 60 * 60 * 1000 : 0)));

  return {
    prefix,
    dateStr,
    full: `Your first digest will arrive ${prefix} ${dateStr} at 6 pm — ${SCANNING_REASSURANCE}.`,
  };
}

/** Convenience wrapper that returns only the formatted string. */
export function getDigestArrivalString(now?: Date): string {
  return getDigestArrival(now).full;
}
