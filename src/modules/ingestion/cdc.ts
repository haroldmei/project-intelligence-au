// Online CDC Data API adapter — Complying Development Certificate ingestion (#10).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// contract: security.public_data_only = true (CC-BY open data)
//
// Most NSW re-roofing work never generates a DA. Like-for-like re-roofs are
// EXEMPT development (Codes SEPP 2008 s2.53(c)) — no lodgement at all — while
// material-change re-roofs (tile→metal) go through the CDC pathway, published in
// the NSW Online CDC Data API (planningportal.nsw.gov.au/opendata/dataset/
// online-cdc-data-api). A DA-only feed structurally misses the ICP's core work
// (docs/24 G1), so this adapter ingests CDC records as first-class development
// applications with `approvalPathway: "cdc"`.
//
// Shape parity: the CDC API mirrors the Online DA Data API (`fetchNswPlanningDAs`
// in sources.ts) — same ePlanning subscription-key auth, council + `since`
// filter, incremental fetch — so this adapter mirrors it, paginating like the PCC
// adapter for busy LGAs. Both feeds are covered by the SAME NSW_PLANNING_API_KEY
// subscription; CDC has its own default-on `CDC_INGEST_ENABLED` flag.
//
// Unlike the PCC adapter (which LINKS certificates to existing DAs), CDC records
// ARE applications: they flow through the same upsert path (upsertDa) and the
// same rule → vector → rerank relevance pipeline as DAs. Their daId is namespaced
// with a `CDC-` prefix so a CDC number can never collide with a DA of the same
// council-issued reference under the (daId, council) uniqueness.
import { fetchWithRetry, politeDelay } from "./fetch";
import type { RawDaRecord } from "./sources";
import { env } from "@/lib/env";

/** NSW Planning Portal CDC base URL — reuses the DA feed's configured base. */
const NSW_CDC_BASE = env.NSW_PLANNING_API_BASE;

/** Records requested per page from the paginated CDC endpoint. */
const CDC_PAGE_SIZE = 200;

/**
 * Cap on pages fetched per council per run. Incremental fetch (`sinceDaysBack`)
 * keeps the daily delta small, so 10 × 200 = 2000 CDCs is comfortably more than
 * any council issues in a day; the cap just bounds a pathological response.
 */
const MAX_CDC_PAGES = 10;

/**
 * The CDC API's application record. Field names mirror the DA feed's
 * `NswPlanningDA` shape (the two datasets share the ePlanning schema family):
 * an application number, a council code, the site address, the proposed
 * development text, an estimated cost, the lodged date, the applicant, a portal
 * URL, and a free-text scope description.
 */
interface NswCdcApplication {
  applicationNumber: string;
  councilCode: string;
  address: string;
  proposedDevelopment: string;
  estimatedCost: number | null;
  lodgedDate: string;
  applicant: string | null;
  url: string;
  scopeDescription: string | null;
}

/**
 * Whether CDC ingestion is enabled. Unlike the other expansion feeds this
 * defaults ON (#10): CDC is the pathway that actually carries re-roofs, so it
 * should flow as soon as an ePlanning subscription key lands. Read from the RAW
 * env at CALL TIME (not the frozen `@/lib/env` snapshot, and not `z.coerce.boolean`
 * which treats "false" as truthy) so a single process/test can toggle it and an
 * explicit "false"/"0" genuinely disables it.
 */
export function isCdcIngestEnabled(): boolean {
  const v = process.env.CDC_INGEST_ENABLED;
  return v !== "false" && v !== "0";
}

/**
 * Namespace a CDC application number so it can never collide with a DA of the
 * same council-issued reference under the (daId, council) uniqueness. Councils
 * mint DA and CDC references from overlapping number ranges (e.g. both a
 * "2024/0123" DA and a "2024/0123" CDC can exist in one LGA), so without a
 * prefix the CDC upsert would silently overwrite the DA row. Idempotent: a
 * reference the certifier already emitted with a CDC marker (case-insensitive
 * "CDC") is left untouched so re-ingesting the same record maps to the same id.
 */
export function namespaceCdcDaId(applicationNumber: string): string {
  const trimmed = applicationNumber.trim();
  return /cdc/i.test(trimmed) ? trimmed : `CDC-${trimmed}`;
}

/**
 * Map one raw CDC API application to a normalised `RawDaRecord`, or `null` when
 * it is missing the fields we need (application number or address). Pure —
 * fixture-tested — so the mapping + daId namespacing is verifiable without an
 * HTTP call. Stamps `approvalPathway: "cdc"` and `sourceApi: "nsw_cdc"`; the
 * "Complying Development Certificate" marker is folded into rawScopeText so the
 * Stage-1 tsvector and the LLM rerank both see the pathway in the text as well
 * as on the structured field.
 */
export function mapCdcApplication(
  raw: NswCdcApplication,
  council: string,
): RawDaRecord | null {
  const applicationNumber = raw.applicationNumber?.trim();
  if (!applicationNumber) return null;
  const address = raw.address?.trim();
  if (!address) return null;

  const scopeParts = ["Complying Development Certificate", raw.scopeDescription]
    .filter((s): s is string => Boolean(s?.trim()))
    .filter((s, i, arr) => arr.indexOf(s) === i);

  return {
    daId: namespaceCdcDaId(applicationNumber),
    council,
    address,
    description: raw.proposedDevelopment ?? "",
    estimatedValue: raw.estimatedCost ?? null,
    lodgementDate: raw.lodgedDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    determinationDate: null,
    applicantName: raw.applicant ?? null,
    portalUrl: raw.url,
    rawScopeText: scopeParts.join(". "),
    developmentType: null, // CDC API exposes no categorical dev-type field
    sourceApi: "nsw_cdc",
    approvalPathway: "cdc",
  };
}

/**
 * Fetch Complying Development Certificates lodged for a single council in the
 * last `sinceDaysBack` days. Mirrors `fetchNswPlanningDAs`: `x-api-key` auth, a
 * council + `since` filter, and incremental fetch — but paginates over the
 * `page` param (a busy LGA can issue more CDCs than a single page holds).
 *
 * Returns [] (no throw) when the API key is unset — the caller
 * (`fetchCouncilDAs`) already gates on the flag + key, but this keeps the
 * adapter safe to call directly. Dedupes by (namespaced) daId across page
 * boundaries.
 */
export async function fetchCouncilCdcs(
  council: string,
  sinceDaysBack: number,
): Promise<RawDaRecord[]> {
  const apiKey = env.NSW_PLANNING_API_KEY;
  if (!apiKey) return [];

  const since = new Date();
  since.setDate(since.getDate() - sinceDaysBack);
  const sinceStr = since.toISOString().slice(0, 10);

  const headers: Record<string, string> = { "x-api-key": apiKey };
  const records: RawDaRecord[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < MAX_CDC_PAGES; page++) {
    await politeDelay();
    const url =
      `${NSW_CDC_BASE}/complying-development-certificates` +
      `?council=${encodeURIComponent(council)}` +
      `&since=${sinceStr}` +
      `&limit=${CDC_PAGE_SIZE}` +
      `&page=${page}`;

    const data = await fetchWithRetry<{ applications: NswCdcApplication[] }>(url, { headers });
    const applications = data?.applications ?? [];
    if (applications.length === 0) break;

    for (const app of applications) {
      const record = mapCdcApplication(app, council);
      if (!record) continue;
      // A CDC can appear on the boundary of two pages; dedupe by namespaced id.
      if (seen.has(record.daId)) continue;
      seen.add(record.daId);
      records.push(record);
    }

    // Partial page → the feed has no more results for this council.
    if (applications.length < CDC_PAGE_SIZE) break;
  }

  return records;
}
