// Jurisdiction configuration + timezone groundwork — the pure, jsdom-safe half
// of the multi-jurisdiction seam (docs/25 §4). This module holds ONLY data and
// pure functions: no `@/lib/env` (server-only, throws in jsdom), no `db`, no
// adapter wiring. That keeps it importable by:
//   - the always-on fe vitest suite (DST week-window + registry-id tests),
//   - the cost ledger (`weekStartAEST` now reads the nsw timezone from here),
//   - the digest cron (reads the nsw "Sunday 18:00 local" digest window).
// The adapter wiring (which pulls in the env-bound NSW sources) lives in the
// server-only `registry.ts`.

/**
 * NSW council slugs served by the roofing wedge (15 LGAs). Canonical source of
 * truth — `ingest.ts` re-exports this as `ALL_COUNCIL_SLUGS`. Order is
 * significant: `runIngest` iterates it in place, so the per-council
 * ingestion_log rows land in this exact order (byte-identical to pre-#28).
 * `as const` so `CouncilSlug` can be derived from it.
 */
export const NSW_REGIONS = [
  // Western Sydney
  "blacktown",
  "cumberland",
  "parramatta",
  "penrith",
  "the_hills",
  // Inner West & City
  "burwood",
  "canada_bay",
  "city_of_sydney",
  "inner_west",
  // Northern Sydney
  "hornsby",
  "ku_ring_gai",
  "northern_beaches",
  // Southern Sydney
  "bayside",
  "georges_river",
  "sutherland",
] as const;

/**
 * Per-jurisdiction configuration. `timezone`/`currency` are the timezone
 * groundwork (docs/25 §4): a new jurisdiction ships its local time + currency
 * here rather than hardcoding `Australia/Sydney`/AUD across the codebase. The
 * digest anchor ("Sunday 18:00 local") is expressed as `digestDayOfWeek` +
 * `digestHourLocal` so `digestWeekWindow` can compute the week window in the
 * jurisdiction's own wall-clock, DST-correct.
 */
export interface JurisdictionConfig {
  readonly id: string;
  /** IANA timezone, e.g. "Australia/Sydney". */
  readonly timezone: string;
  /** ISO-4217 currency, e.g. "AUD". */
  readonly currency: string;
  /** Digest send day in local time. 0 = Sunday … 6 = Saturday. */
  readonly digestDayOfWeek: number;
  /** Digest send hour in local time (0–23). */
  readonly digestHourLocal: number;
}

export const JURISDICTION_CONFIGS: Record<string, JurisdictionConfig> = {
  // NSW — the incumbent. The cron fires Sunday 07:00 UTC ≈ 17:00–18:00 local;
  // the digest week window closes at Sunday 18:00 Australia/Sydney.
  nsw: {
    id: "nsw",
    timezone: "Australia/Sydney",
    currency: "AUD",
    digestDayOfWeek: 0,
    digestHourLocal: 18,
  },
  // SA (PlanSA) — dormant (docs/25 §6). Adelaide runs its own DST offset from
  // Sydney (UTC+9:30 / +10:30), so it needs a distinct timezone even though the
  // digest cadence matches.
  sa: {
    id: "sa",
    timezone: "Australia/Adelaide",
    currency: "AUD",
    digestDayOfWeek: 0,
    digestHourLocal: 18,
  },
};

/**
 * Env flag that must be truthy for a jurisdiction to be ingested. `undefined`
 * means always-on (NSW is the incumbent, ungated). SA is gated behind
 * `SA_INGEST_ENABLED` until the PlanSA license question closes (docs/25 §6).
 */
const JURISDICTION_FLAGS: Record<string, string | undefined> = {
  nsw: undefined,
  sa: "SA_INGEST_ENABLED",
};

export function getJurisdictionConfig(id: string): JurisdictionConfig {
  const config = JURISDICTION_CONFIGS[id];
  if (!config) throw new Error(`Unknown jurisdiction: ${id}`);
  return config;
}

/**
 * Read a boolean feature flag from the live environment. Strict truthiness
 * ("true" / "1") — deliberately narrower than z.coerce.boolean (which treats
 * any non-empty string, including "false", as true) so a stray value can't
 * silently switch on a jurisdiction. Read at CALL TIME (not from the frozen
 * `@/lib/env` snapshot) so a single test can toggle it.
 */
export function isFlagEnabled(name: string): boolean {
  const v = process.env[name];
  return v === "true" || v === "1";
}

/**
 * Jurisdiction ids active given the live flag state. NSW is always present;
 * additional jurisdictions appear only when their flag is truthy. With every
 * optional flag off this is `["nsw"]`, so ingestion is byte-identical to the
 * NSW-only pipeline. Insertion order of JURISDICTION_CONFIGS (nsw first) is
 * preserved.
 */
export function getEnabledJurisdictionIds(): string[] {
  return Object.keys(JURISDICTION_CONFIGS).filter((id) => {
    const flag = JURISDICTION_FLAGS[id];
    return flag === undefined || isFlagEnabled(flag);
  });
}

// ─── Timezone-aware week-window computation (DST-correct) ────────────────────
//
// JS Date has no timezone support beyond the host's, so we lean on Intl to read
// a jurisdiction's local wall-clock and reconstruct UTC instants. Everything
// below is pure and unit-tested against Sydney DST-start / DST-end fixtures.

const MS_PER_DAY = 86_400_000;

/** Offset (ms) of `timeZone` from UTC at instant `at`: localWallClock − utc. */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(at)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  // Some engines emit "24" for midnight; normalise to 0 on the same day.
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, hour, parts.minute, parts.second);
  return asUtc - at.getTime();
}

/** Local wall-clock calendar of `at` in `timeZone`. */
function zonedCalendar(
  timeZone: string,
  at: Date,
): { year: number; month: number; day: number; dow: number } {
  // Reinterpret the wall clock as if it were UTC so getUTC* reads local fields.
  const wall = new Date(at.getTime() + zoneOffsetMs(timeZone, at));
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    dow: wall.getUTCDay(),
  };
}

/** Convert a wall-clock time in `timeZone` to the corresponding UTC instant. */
function zonedWallToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // First approximation using the offset at the naive instant, then refine once
  // (the offset can differ on the far side of a DST boundary).
  const off1 = zoneOffsetMs(timeZone, new Date(naiveUtc));
  let ts = naiveUtc - off1;
  const off2 = zoneOffsetMs(timeZone, new Date(ts));
  if (off2 !== off1) ts = naiveUtc - off2;
  return new Date(ts);
}

/**
 * The UTC instant of Monday 00:00 in `timeZone` for the week containing `at`,
 * DST-correct. Replaces the fixed-UTC+10 assumption in the cost ledger's
 * `weekStartAEST`, which drifted by an hour every summer (AEDT).
 */
export function weekStartInZone(timeZone: string, at: Date = new Date()): Date {
  const cal = zonedCalendar(timeZone, at);
  const daysFromMonday = (cal.dow + 6) % 7; // 0=Sun → 6, 1=Mon → 0, …
  // Date.UTC normalises month/year rollover for us.
  const monday = new Date(Date.UTC(cal.year, cal.month - 1, cal.day - daysFromMonday));
  return zonedWallToUtc(
    timeZone,
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    0,
    0,
    0,
  );
}

/**
 * The digest week window for a jurisdiction: the [start, end) interval bounded
 * by consecutive "digest anchors" (digestDayOfWeek at digestHourLocal, local
 * time), where `end` is the most recent anchor at or before `now`.
 *
 * `start` and `end` are the SAME local wall-clock time seven calendar days
 * apart, reconverted to UTC — so across a DST transition the interval is 169h
 * (Sydney autumn) or 167h (Sydney spring), not a naive 168h. This is the
 * "Sunday 18:00 local" window the digest cron reads from the nsw config.
 */
export function digestWeekWindow(
  config: JurisdictionConfig,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const cal = zonedCalendar(config.timezone, now);
  const daysSinceAnchorDay = (cal.dow - config.digestDayOfWeek + 7) % 7;
  const anchorDay = new Date(Date.UTC(cal.year, cal.month - 1, cal.day - daysSinceAnchorDay));
  let end = zonedWallToUtc(
    config.timezone,
    anchorDay.getUTCFullYear(),
    anchorDay.getUTCMonth() + 1,
    anchorDay.getUTCDate(),
    config.digestHourLocal,
    0,
    0,
  );
  // If this cycle's anchor hasn't passed yet, step back a local week.
  if (end.getTime() > now.getTime()) {
    const prev = new Date(
      Date.UTC(anchorDay.getUTCFullYear(), anchorDay.getUTCMonth(), anchorDay.getUTCDate() - 7),
    );
    end = zonedWallToUtc(
      config.timezone,
      prev.getUTCFullYear(),
      prev.getUTCMonth() + 1,
      prev.getUTCDate(),
      config.digestHourLocal,
      0,
      0,
    );
  }
  // start = same local wall-clock time, seven local days earlier.
  const endCal = zonedCalendar(config.timezone, end);
  const startDay = new Date(Date.UTC(endCal.year, endCal.month - 1, endCal.day - 7));
  const start = zonedWallToUtc(
    config.timezone,
    startDay.getUTCFullYear(),
    startDay.getUTCMonth() + 1,
    startDay.getUTCDate(),
    config.digestHourLocal,
    0,
    0,
  );
  return { start, end };
}

export { MS_PER_DAY };
