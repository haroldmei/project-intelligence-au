// BOM storm-warning feed fetch + feature-flag gate for the storm brief (#20).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Network layer only — parsing lives in ./parse (pure), matching in ./lgas
// (pure). Kept free of `@/lib/env` so the flag can be toggled per-test at call
// time; reuses the ingestion `fetchTextWithRetry` (polite UA, retry/backoff).
import { fetchTextWithRetry } from "@/modules/ingestion/fetch";
import { parseWarnings } from "./parse";
import type { StormWarning } from "./types";

/**
 * BOM public NSW warnings RSS. The Bureau mirrors its anonymous-FTP warning
 * products over HTTP under www.bom.gov.au; IDZ00060 is the NSW warnings summary.
 * Overridable via BOM_WARNINGS_URL for staging/fixtures without a code change.
 */
const DEFAULT_BOM_NSW_WARNINGS_URL = "http://www.bom.gov.au/fwo/IDZ00060.warnings_nsw.xml";

/**
 * Whether the storm-brief feature is switched on. Strict truthiness ("true" /
 * "1") read from the RAW env at CALL TIME (not the frozen `@/lib/env` snapshot),
 * mirroring the jurisdiction/vertical flag pattern so a single process/test can
 * toggle it. Default off until dogfooded (docs/24 §4 August item 5).
 */
export function isStormBriefEnabled(): boolean {
  const v = process.env.STORM_BRIEF_ENABLED;
  return v === "true" || v === "1";
}

/** The configured BOM warnings feed URL (env override or documented default). */
export function bomWarningsUrl(): string {
  return process.env.BOM_WARNINGS_URL || DEFAULT_BOM_NSW_WARNINGS_URL;
}

/**
 * Fetch and parse the current BOM NSW severe-weather / severe-thunderstorm
 * warnings. Returns [] on a fetch failure (logged upstream by fetchTextWithRetry)
 * so a transient BOM outage degrades to "no brief this tick" rather than a 500.
 */
export async function fetchStormWarnings(): Promise<StormWarning[]> {
  const xml = await fetchTextWithRetry(bomWarningsUrl(), {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  return parseWarnings(xml);
}
