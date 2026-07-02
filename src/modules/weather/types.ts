// Types for the mid-week storm brief (#20).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Storm/hail/insurance work is a major channel for Sydney roofers that never
// appears in planning data (docs/24 §4 August item 5). This brief is triggered
// by Bureau of Meteorology severe-weather warnings for a user's subscribed LGAs.

/** Coarse warning category we brief on. Anything else is dropped. */
export type WarningType = "severe_thunderstorm" | "severe_weather";

/** A single BOM warning parsed from the public NSW warnings feed. */
export interface StormWarning {
  /** Stable BOM warning identifier (e.g. "IDN21031"). Dedupe key. */
  id: string;
  type: WarningType;
  /** Human title as published by BOM, e.g. "Severe Thunderstorm Warning". */
  title: string;
  /** Issue time (UTC). Null if the feed omitted / had an unparseable date. */
  issuedAt: Date | null;
  /** Free-text affected-area / district names extracted from the warning. */
  areas: string[];
  /** BOM warning detail page. */
  url: string;
}
