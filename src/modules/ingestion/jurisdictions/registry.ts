// Jurisdiction adapter registry — the single place that pairs each enabled
// jurisdiction with its adapter, config, and the regions to fetch. Formalises
// the multi-jurisdiction seam (issue #28): `runIngest` iterates
// `getEnabledJurisdictions()` rather than knowing about NSW councils directly.
//
// SERVER-ONLY: this imports the NSW adapter, which wraps `sources.ts` →
// `@/lib/env` (throws in jsdom). The pure, jsdom-safe half — configs, flags,
// enabled-id resolution, week-window math — lives in `./config`, which the
// always-on fe vitest suite imports instead. NSW is the incumbent and always
// enabled; SA is gated behind SA_INGEST_ENABLED (default off), so with the flag
// off `getEnabledJurisdictions()` yields only NSW and ingestion is
// byte-identical to the pre-#28 per-council loop.
import { nswAdapter } from "./nsw";
import { saAdapter } from "./sa";
import {
  NSW_REGIONS,
  getEnabledJurisdictionIds,
  getJurisdictionConfig,
  type JurisdictionConfig,
} from "./config";
import type { JurisdictionAdapter } from "./types";

interface Registration {
  adapter: JurisdictionAdapter;
  /** Regions to fetch. NSW: the 15 council slugs. Statewide feeds: a single
   *  pseudo-region (the jurisdiction id) — the adapter applies its own filter. */
  regions: readonly string[];
  /**
   * Whether to run the per-region drift alert (FR-003). NSW councils have a
   * stable daily cadence worth alerting on; SA is dormant and statewide, so it
   * inherits the pre-#28 behaviour of no drift check (matches the SA adapter as
   * originally merged in #29).
   */
  driftDetection: boolean;
}

const REGISTRY: Record<string, Registration> = {
  nsw: { adapter: nswAdapter, regions: NSW_REGIONS, driftDetection: true },
  // South Australia (PlanSA). DORMANT — do not enable until the commercial-use
  // license question (docs/25 §6) is closed.
  sa: { adapter: saAdapter, regions: ["sa"], driftDetection: false },
};

export interface EnabledJurisdiction {
  id: string;
  adapter: JurisdictionAdapter;
  config: JurisdictionConfig;
  regions: readonly string[];
  driftDetection: boolean;
}

/**
 * The jurisdictions to ingest given the live flag state, keyed by id, each
 * paired with its adapter, config, and regions. With every optional flag off
 * this is just NSW.
 */
export function getEnabledJurisdictions(): EnabledJurisdiction[] {
  return getEnabledJurisdictionIds().map((id) => {
    const reg = REGISTRY[id];
    if (!reg) throw new Error(`Enabled jurisdiction '${id}' has no registry entry`);
    return {
      id,
      adapter: reg.adapter,
      config: getJurisdictionConfig(id),
      regions: reg.regions,
      driftDetection: reg.driftDetection,
    };
  });
}
