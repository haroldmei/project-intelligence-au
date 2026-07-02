// Online PCC Data API adapter — Construction Certificate ingestion (issue #13).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// contract: security.public_data_only = true (CC-BY open data)
//
// DA/CDC data tells a roofer work *might* happen in 6–18 months; a Construction
// Certificate (CC) means work is about to START. The NSW Online PCC Data API
// (planningportal.nsw.gov.au/opendata/dataset/online-pcc-data-api) publishes
// Construction/Occupation/Subdivision Certificates statewide, daily, CC-BY,
// under the SAME subscription-key model as the DA/CDC feeds — so this adapter
// mirrors the Online DA API adapter (`fetchNswPlanningDAs` in sources.ts):
// pagination, 15-LGA filter, incremental fetch, `PCC_INGEST_ENABLED` flag, and a
// no-op without `NSW_PLANNING_API_KEY`.
//
// v1 scope: Construction Certificates ONLY. Occupation (OC) and Subdivision (SC)
// certificates are filtered out at mapping time — they signal work FINISHING or
// land being carved up, neither of which is a "roofer, bid now" moment.
//
// This does NOT produce DA rows. A CC references an existing application (a DA or
// CDC number + council); the ingest runner (pcc-ingest.ts) links each CC back to
// its `DevelopmentApplication` and stamps `constructionCertifiedAt`.
import { fetchWithRetry, politeDelay } from "./fetch";
import { env } from "@/lib/env";

/** Normalised Construction Certificate after adapting from the PCC feed. */
export interface RawPccRecord {
  /** Certificate reference number, e.g. "CC-2024/0421". */
  certificateNumber: string;
  /** The related application this CC was issued against — a DA or CDC number. */
  relatedApplicationId: string;
  /** Council slug (matches lgas.id / development_applications.council). */
  council: string;
  /** yyyy-mm-dd — the date the Construction Certificate was issued. */
  issuedDate: string;
  /** Public portal URL for the certificate, when the feed exposes one. */
  portalUrl: string | null;
}

/** NSW Planning Portal PCC base URL — reuses the DA feed's configured base. */
const NSW_PCC_BASE = env.NSW_PLANNING_API_BASE;

/** Records requested per page from the paginated PCC endpoint. */
const PCC_PAGE_SIZE = 200;

/**
 * Cap on pages fetched per council per run. A single populous LGA on a heavy CC
 * day shouldn't burn the whole cron's HTTP budget; incremental fetch
 * (`sinceDaysBack`) keeps the daily delta small so 10 pages × 200 = 2000 CCs is
 * comfortably more than any council issues in a day.
 */
const MAX_PCC_PAGES = 10;

/**
 * The PCC API's certificate record. Field names mirror the DA feed's
 * `NswPlanningDA` shape (the two datasets share the ePlanning schema family):
 * a certificate number, its type, the related application reference, a council
 * code, the issue date, and a portal URL.
 */
interface NswPccCertificate {
  certificateNumber: string;
  /** e.g. "Construction Certificate", "Occupation Certificate", or a "CC"/"OC"/"SC" code. */
  certificateType: string;
  /** The DA or CDC number this certificate is issued against. */
  relatedApplicationNumber: string;
  councilCode: string;
  issuedDate: string;
  url: string | null;
}

/**
 * True iff `certificateType` denotes a Construction Certificate. Robust to the
 * two shapes the feed uses across councils — the long label ("Construction
 * Certificate") and the short code ("CC") — and case/whitespace noise. Occupation
 * ("Occupation Certificate"/"OC") and Subdivision ("Subdivision Certificate"/
 * "SC") certificates return false so they're dropped in v1.
 *
 * Exact match on the "cc" code (not `includes`) so a stray "cc" inside, say,
 * "Occ..." can never misclassify — but "OC"/"SC" never contain "construction"
 * either, so the label branch is unambiguous on its own.
 */
export function isConstructionCertificate(certificateType: string | null | undefined): boolean {
  if (!certificateType) return false;
  const normalised = certificateType.trim().toLowerCase();
  if (normalised === "cc") return true;
  return normalised.includes("construction certificate");
}

/**
 * Map one raw PCC API certificate to a normalised record, or `null` when it is
 * not a Construction Certificate (OC/SC — ignored in v1) or is missing the
 * fields we need to link it (certificate number or related application). Pure —
 * fixture-tested — so the mapping + CC filter is verifiable without an HTTP call.
 */
export function mapPccCertificate(
  raw: NswPccCertificate,
  council: string,
): RawPccRecord | null {
  if (!isConstructionCertificate(raw.certificateType)) return null;
  const relatedApplicationId = raw.relatedApplicationNumber?.trim();
  const certificateNumber = raw.certificateNumber?.trim();
  // Without a related application reference there is nothing to link the CC to;
  // without a certificate number we can't identify it. Drop either case.
  if (!relatedApplicationId || !certificateNumber) return null;

  return {
    certificateNumber,
    relatedApplicationId,
    council,
    issuedDate:
      raw.issuedDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    portalUrl: raw.url ?? null,
  };
}

/**
 * Fetch Construction Certificates issued for a single council in the last
 * `sinceDaysBack` days. Mirrors `fetchNswPlanningDAs`: `x-api-key` auth, a
 * council + `since` filter, and incremental fetch — but paginates over the
 * `page` param (the DA feed single-shots at limit=200; the PCC feed can return
 * more CCs than that on a busy day for a populous LGA).
 *
 * Returns [] (no throw) when the API key is unset — the caller (`runPccIngest`)
 * already gates on the flag + key, but this keeps the adapter safe to call
 * directly. OC/SC certificates are filtered out by `mapPccCertificate`.
 */
export async function fetchCouncilPccs(
  council: string,
  sinceDaysBack: number,
): Promise<RawPccRecord[]> {
  const apiKey = env.NSW_PLANNING_API_KEY;
  if (!apiKey) return [];

  const since = new Date();
  since.setDate(since.getDate() - sinceDaysBack);
  const sinceStr = since.toISOString().slice(0, 10);

  const headers: Record<string, string> = { "x-api-key": apiKey };
  const records: RawPccRecord[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PCC_PAGES; page++) {
    await politeDelay();
    const url =
      `${NSW_PCC_BASE}/certificates` +
      `?council=${encodeURIComponent(council)}` +
      `&since=${sinceStr}` +
      `&type=construction` +
      `&limit=${PCC_PAGE_SIZE}` +
      `&page=${page}`;

    const data = await fetchWithRetry<{ certificates: NswPccCertificate[] }>(url, { headers });
    const certificates = data?.certificates ?? [];
    if (certificates.length === 0) break;

    for (const cert of certificates) {
      const record = mapPccCertificate(cert, council);
      if (!record) continue;
      // A CC can appear on the boundary of two pages; dedupe by certificate no.
      if (seen.has(record.certificateNumber)) continue;
      seen.add(record.certificateNumber);
      records.push(record);
    }

    // Partial page → the feed has no more results for this council.
    if (certificates.length < PCC_PAGE_SIZE) break;
  }

  return records;
}
