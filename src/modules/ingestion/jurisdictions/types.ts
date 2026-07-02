// Jurisdiction adapter interface — the formal multi-jurisdiction ingestion seam
// (issue #28, docs/25 §4.1). This is the canonical contract every jurisdiction
// feed implements; the NSW sources (ePlanning DA/CDC/PCC + DAEX fallback) and
// PlanSA both wrap up to it. Behaviour is byte-identical for NSW: the interface
// only formalises the boundary that `sources.ts` already half-had.
//
// SERVER/JSDOM SAFETY: this module is pure types (no runtime imports beyond a
// TYPE-ONLY `RawDaRecord`), so it is safe to import from the always-on jsdom
// vitest suite. Importing the `sources.ts` *module* at runtime would drag in
// `@/lib/env`, which throws in a client/jsdom context — hence `import type`.
import type { RawDaRecord } from "../sources";

/**
 * A DA record after adapting from any jurisdiction's feed. Extends the NSW-era
 * `RawDaRecord` (which the ingest/upsert pipeline already consumes) with the
 * two fields multi-jurisdiction ingestion needs:
 *
 *   - `jurisdiction`: which statewide feed this came from (`nsw`, `sa`, …).
 *     Stamped onto the `development_applications.jurisdiction` column.
 *   - `assessmentPathway`: the planning pathway (SA exposes `assessmentpathway`;
 *     NSW has no direct equivalent, so the NSW adapter leaves it null — see the
 *     `pathwaysSupported` capability flag).
 *
 * `estimatedValue` stays on the base record and is `null` for feeds with no
 * cost-of-work field (PlanSA has none — see docs/25 §1.2, and the `hasValue`
 * capability flag). The digest card renders fine without a value, so `null` is
 * a first-class value here, not a gap to backfill.
 */
export interface NormalisedApplication extends RawDaRecord {
  jurisdiction: string;
  assessmentPathway: string | null;
}

/**
 * What a jurisdiction's feed can and can't tell us. Lets downstream consumers
 * branch on data availability instead of hardcoding per-jurisdiction knowledge:
 *   - `hasValue`: the feed exposes a cost-of-work $ value (NSW yes via
 *     ePlanning `estimatedCost`; SA no).
 *   - `pathwaysSupported`: the feed exposes a planning assessment pathway
 *     (SA yes via `assessmentpathway`; NSW no).
 */
export interface JurisdictionCapabilities {
  hasValue: boolean;
  pathwaysSupported: boolean;
}

/**
 * Options for a single fetch. `since` is the incremental low-water mark (only
 * applications lodged on/after this instant); `regions` is the set of
 * sub-regions to fetch (NSW council slugs). Statewide feeds (SA) apply their
 * own internal region filter and ignore `regions`. `pageSize`/`maxPages` are
 * optional knobs for feeds that paginate (ArcGIS).
 */
export interface JurisdictionFetchOptions {
  since: Date;
  regions: string[];
  pageSize?: number;
  maxPages?: number;
}

/**
 * A jurisdiction feed adapter. One per jurisdiction (`nsw`, `sa`, …). The
 * adapter knows its own id and capabilities; the registry pairs it with its
 * `JurisdictionConfig` (timezone, currency) and the regions to fetch.
 */
export interface JurisdictionAdapter {
  /** Stable jurisdiction slug — matches `NormalisedApplication.jurisdiction`. */
  readonly id: string;
  readonly capabilities: JurisdictionCapabilities;
  fetchApplications(opts: JurisdictionFetchOptions): Promise<NormalisedApplication[]>;
}
