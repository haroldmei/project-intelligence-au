// Jurisdiction adapter interface — the multi-jurisdiction ingestion seam.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies. Expansion
// Wave 2 (docs/25 §1.2/§2/§4) generalises ingestion beyond NSW.
//
// This is the contract described in docs/25 §4.1 ("Jurisdiction adapter
// interface"): `fetchApplications(jurisdiction, since)` returning a normalised
// record. It is DEFINED HERE (not imported from the #28 branch) so the SA
// adapter has a contract to implement without blocking on that merge; when the
// formal interface lands, this collapses into it.
//
// SERVER/JSDOM SAFETY: this module is imported by adapters whose tests run in
// the always-on (no-DB, jsdom) vitest suite. It therefore pulls `RawDaRecord`
// / `SourceApi` as TYPE-ONLY imports — importing the sources.ts *module* at
// runtime would drag in `@/lib/env`, which throws in a client/jsdom context.
import type { RawDaRecord } from "../sources";

/**
 * A DA record after adapting from any jurisdiction's feed. Extends the NSW-era
 * `RawDaRecord` (which the ingest/upsert pipeline already consumes) with the
 * two fields multi-jurisdiction ingestion needs:
 *
 *   - `jurisdiction`: which statewide feed this came from (`nsw`, `sa`, …).
 *   - `assessmentPathway`: the planning pathway (SA exposes `assessmentpathway`;
 *     NSW has no direct equivalent, so NSW adapters leave it null).
 *
 * `estimatedValue` stays on the base record and is `null` for feeds with no
 * cost-of-work field (PlanSA has none — see docs/25 §1.2). The digest card
 * renders fine without a value, so `null` is a first-class value here, not a
 * gap to backfill.
 */
export interface NormalisedApplication extends RawDaRecord {
  jurisdiction: string;
  assessmentPathway: string | null;
}

export interface JurisdictionFetchOptions {
  /** Incremental window: only applications lodged within the last N days. */
  sinceDaysBack?: number;
  /** ArcGIS/API page size (records per request). */
  pageSize?: number;
  /** Safety cap on pages fetched per run so one feed can't burn the whole cron. */
  maxPages?: number;
}

/**
 * A statewide jurisdiction feed adapter. One per jurisdiction (`nsw`, `sa`, …).
 * The adapter knows its own jurisdiction, so `fetchApplications` only takes the
 * incremental window — matching docs/25 §4.1's `fetchApplications(since)` shape
 * once the jurisdiction is bound.
 */
export interface JurisdictionAdapter {
  /** Stable jurisdiction slug — matches `NormalisedApplication.jurisdiction`. */
  readonly jurisdiction: string;
  fetchApplications(opts?: JurisdictionFetchOptions): Promise<NormalisedApplication[]>;
}
