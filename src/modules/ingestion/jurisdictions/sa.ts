// South Australia (PlanSA) jurisdiction adapter — Expansion Wave 2, DORMANT.
// WEDGE: The Sunday-night roofing DA digest. docs/25 §1.2/§2/§4.
//
// SA has the only other NSW-grade statewide per-application feed in the
// country: a public ArcGIS FeatureServer covering all 60+ councils since ~2021.
//   https://location.sa.gov.au/server6/rest/services/GrowthManagementPublic/DevelopmentApplicationRegister_PRODUCTION/FeatureServer/1
// Standard ArcGIS REST query: /query?where=...&outFields=*&f=json, paginated via
// resultOffset. No cost-of-work $ value field — records map with value = null.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ DORMANT — DO NOT ENABLE until the PlanSA commercial-use license question  │
// │ (docs/25 §6, human-owned) is closed. The jurisdiction registry only       │
// │ includes this adapter when SA_INGEST_ENABLED is truthy; with the flag off │
// │ it is never constructed into an ingest run and behaviour is byte-identical │
// │ to today. This module is built + fixture-tested so the flip is a one-liner.│
// └──────────────────────────────────────────────────────────────────────────┘
//
// SERVER/JSDOM SAFETY: no `@/lib/env` import (it throws in jsdom); the flag is
// read at call time in registry.ts. `RawDaRecord`/`SourceApi` are type-only.
import { fetchWithRetry, politeDelay } from "../fetch";
import type { JurisdictionAdapter, JurisdictionFetchOptions, NormalisedApplication } from "./types";

/** ArcGIS FeatureServer layer for the PlanSA Development Application Register. */
const PLANSA_FEATURESERVER =
  "https://location.sa.gov.au/server6/rest/services/GrowthManagementPublic/DevelopmentApplicationRegister_PRODUCTION/FeatureServer/1";

/**
 * Public PlanSA register base. The exact per-application deep-link format is
 * TBD pending the portal/license review (docs/25 §6); until then we point at
 * the register search keyed on the application id, which resolves the entry.
 */
const PLANSA_PORTAL_BASE = "https://plan.sa.gov.au/development_application_register";

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 20;

/**
 * Adelaide-metro council reference data. PlanSA is statewide (60+ councils);
 * the roofing wedge only cares about the metro market, so we filter incoming
 * records to this list by `locationcouncil`. Stored as display names; matched
 * via `normaliseCouncil` so exact-string drift (punctuation, "City of",
 * "Council" suffix, "&" vs "and") doesn't silently drop a metro record.
 */
export const SA_ADELAIDE_METRO_COUNCILS: readonly string[] = [
  "City of Adelaide",
  "Adelaide Hills Council",
  "City of Burnside",
  "Campbelltown City Council",
  "City of Charles Sturt",
  "Town of Gawler",
  "City of Holdfast Bay",
  "City of Marion",
  "City of Mitcham",
  "City of Norwood Payneham & St Peters",
  "City of Onkaparinga",
  "City of Playford",
  "City of Port Adelaide Enfield",
  "City of Prospect",
  "City of Salisbury",
  "City of Tea Tree Gully",
  "City of Unley",
  "Corporation of the Town of Walkerville",
  "City of West Torrens",
];

/**
 * Normalise a council name to a comparable key: lowercase, drop the boilerplate
 * ("city of", "town of", "council", …), fold "&"→"and", collapse to single
 * spaces. "City of Norwood Payneham & St Peters" → "norwood payneham and st peters".
 */
export function normaliseCouncil(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(corporation|city|town|district|regional|council|shire|the|of)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const METRO_KEYS = new Set(SA_ADELAIDE_METRO_COUNCILS.map(normaliseCouncil));

/** True iff `locationcouncil` is an Adelaide-metro council we serve. */
export function isAdelaideMetroCouncil(locationcouncil: string | null | undefined): boolean {
  if (!locationcouncil) return false;
  return METRO_KEYS.has(normaliseCouncil(locationcouncil));
}

/** ArcGIS feature attributes for the PlanSA DA register layer. */
export interface PlanSaAttributes {
  appid?: string | null;
  address?: string | null;
  suburb?: string | null;
  locationcouncil?: string | null;
  natureofdevelopment?: string | null; // up to 4,000 chars
  applicationstatus?: string | null;
  devapprovalstatusname?: string | null;
  lodgementdate?: number | string | null; // ArcGIS epoch-ms (number) or ISO string
  currentzone?: string | null;
  assessmentpathway?: string | null;
  publicnotificationrequired?: string | null;
}

interface ArcgisFeature {
  attributes: PlanSaAttributes;
}

export interface ArcgisQueryResponse {
  features?: ArcgisFeature[];
  /** ArcGIS sets this when more records remain past the current page. */
  exceededTransferLimit?: boolean;
}

/** ArcGIS `lodgementdate` → yyyy-mm-dd (UTC). Handles epoch-ms and ISO strings. */
export function toIsoDate(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  let ms: number;
  if (typeof v === "number") {
    ms = v;
  } else if (/^\d+$/.test(v)) {
    ms = Number(v); // numeric string → epoch-ms
  } else {
    const t = new Date(v).getTime();
    if (Number.isNaN(t)) return null;
    ms = t;
  }
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Map raw ArcGIS features onto normalised records, filtering to Adelaide-metro
 * councils and dropping features with no application id. Pure — fixture-tested.
 */
export function mapFeatures(features: ArcgisFeature[]): NormalisedApplication[] {
  const out: NormalisedApplication[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const appid = a.appid?.toString().trim();
    if (!appid) continue; // no stable id → can't upsert
    if (!isAdelaideMetroCouncil(a.locationcouncil)) continue; // outside our market

    const nature = a.natureofdevelopment?.trim() || "";
    const address = [a.address?.trim(), a.suburb?.trim()]
      .filter((s): s is string => Boolean(s))
      .join(", ");

    out.push({
      daId: appid,
      council: a.locationcouncil?.trim() ?? "",
      address,
      description: nature,
      // PlanSA exposes NO cost-of-work $ field (docs/25 §1.2). value = null.
      estimatedValue: null,
      lodgementDate: toIsoDate(a.lodgementdate) ?? todayIso(),
      determinationDate: null,
      // PlanSA has no categorical dev-type enum — `natureofdevelopment` is the
      // free-text scope (already the description). value = null, same as
      // estimatedValue for this value-less feed (#26).
      developmentType: null,
      applicantName: null, // not exposed by the PlanSA register
      portalUrl: `${PLANSA_PORTAL_BASE}?appid=${encodeURIComponent(appid)}`,
      rawScopeText: nature || null,
      sourceApi: "plansa",
      // PlanSA records are development applications; the DA/CDC/SSD distinction
      // (#10) is NSW-specific, so SA rows carry the `da` default. The richer
      // SA-native `assessmentPathway` string is preserved separately below.
      approvalPathway: "da",
      jurisdiction: "sa",
      assessmentPathway: a.assessmentpathway?.trim() || null,
    });
  }
  return out;
}

/** Build the ArcGIS `where` clause: incremental on lodgementdate + metro councils. */
export function buildWhereClause(since: Date): string {
  const sinceStr = since.toISOString().slice(0, 10);
  const councilList = SA_ADELAIDE_METRO_COUNCILS.map((c) => `'${c.replace(/'/g, "''")}'`).join(", ");
  return `lodgementdate >= DATE '${sinceStr}' AND locationcouncil IN (${councilList})`;
}

/** Build a paginated ArcGIS query URL. */
export function buildQueryUrl(where: string, resultOffset: number, resultRecordCount: number): string {
  const params = new URLSearchParams({
    where,
    outFields: "*",
    f: "json",
    returnGeometry: "false",
    orderByFields: "lodgementdate ASC",
    resultOffset: String(resultOffset),
    resultRecordCount: String(resultRecordCount),
  });
  return `${PLANSA_FEATURESERVER}/query?${params.toString()}`;
}

/**
 * The SA jurisdiction adapter. Flag-agnostic by design — the registry is the
 * single gate (docs/25 §6). Callers get an empty array only when the feed is
 * genuinely empty for the window, never as a covert kill-switch.
 *
 * PlanSA is statewide with its own Adelaide-metro council filter, so it ignores
 * the `regions` option (which the formal interface passes for NSW's per-council
 * fan-out). It exposes an assessment pathway but no cost-of-work value.
 */
export const saAdapter: JurisdictionAdapter = {
  id: "sa",
  capabilities: { hasValue: false, pathwaysSupported: true },

  async fetchApplications(opts: JurisdictionFetchOptions): Promise<NormalisedApplication[]> {
    const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
    const where = buildWhereClause(opts.since);

    const records: NormalisedApplication[] = [];
    for (let page = 0; page < maxPages; page++) {
      const url = buildQueryUrl(where, page * pageSize, pageSize);
      const data = await fetchWithRetry<ArcgisQueryResponse>(url);
      const features = data?.features ?? [];
      records.push(...mapFeatures(features));

      // Stop when ArcGIS says no more remain, or the last page came back partial
      // (fewer than a full page → nothing left to offset into).
      const more = data?.exceededTransferLimit === true || features.length >= pageSize;
      if (!more || features.length === 0) break;
      await politeDelay();
    }
    return records;
  },
};
