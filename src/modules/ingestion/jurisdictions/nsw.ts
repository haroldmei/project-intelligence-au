// NSW jurisdiction adapter — wraps the incumbent per-council NSW sources
// (ePlanning DA/CDC/PCC adapters + the DAEX HTML-scrape fallback, with their
// env-gated precedence in `sources.ts`) as the single `nsw` JurisdictionAdapter
// (issue #28). No behaviour change: `fetchApplications` iterates the requested
// council `regions` and delegates each to the existing `fetchCouncilDAs`
// dispatcher, then stamps the normalised records with `jurisdiction: "nsw"`.
//
// SERVER-ONLY: this pulls in `sources.ts`, which imports `@/lib/env` (throws in
// jsdom). It is therefore wired in the server-only `registry.ts`, never imported
// by the always-on fe vitest suite.
import { fetchCouncilDAs } from "../sources";
import { MS_PER_DAY } from "./config";
import type {
  JurisdictionAdapter,
  JurisdictionFetchOptions,
  NormalisedApplication,
} from "./types";

/**
 * The formal interface passes an incremental `since` instant; the NSW source
 * dispatcher still speaks "days back". Convert, flooring at 1 day so a same-day
 * `since` never asks for a zero/negative window. `Math.round` absorbs the
 * sub-second drift between the caller stamping `since` and this conversion.
 */
function daysBackFrom(since: Date): number {
  return Math.max(1, Math.round((Date.now() - since.getTime()) / MS_PER_DAY));
}

export const nswAdapter: JurisdictionAdapter = {
  id: "nsw",
  // NSW ePlanning exposes an estimated cost-of-work value; it has no planning
  // assessment pathway field (unlike PlanSA's `assessmentpathway`).
  capabilities: { hasValue: true, pathwaysSupported: false },

  async fetchApplications({
    since,
    regions,
  }: JurisdictionFetchOptions): Promise<NormalisedApplication[]> {
    const sinceDaysBack = daysBackFrom(since);
    const out: NormalisedApplication[] = [];
    for (const region of regions) {
      const records = await fetchCouncilDAs(region, sinceDaysBack);
      for (const r of records) {
        out.push({ ...r, jurisdiction: "nsw", assessmentPathway: null });
      }
    }
    return out;
  },
};
