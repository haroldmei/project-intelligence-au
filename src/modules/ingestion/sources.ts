// Data source adapters for NSW Planning Portal API + DA Leads / Council DA APIs.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// contract: security.public_data_only = true
//
// Only public endpoints listed in system-design §2 "ingestion" component.
// DO NOT add Cordell, LeadManager, or EstimateOne (contract.security.public_data_only).
import { fetchWithRetry, politeDelay } from "./fetch";

export type SourceApi = "nsw_planning" | "da_leads" | "council_da";

/** Normalised DA record after adapting from any source. */
export interface RawDaRecord {
  daId: string; // Council-issued DA reference number
  council: string; // council slug (matches lgas.id)
  address: string;
  description: string;
  estimatedValue: number | null;
  lodgementDate: string; // yyyy-mm-dd
  applicantName: string | null;
  portalUrl: string;
  rawScopeText: string | null;
  sourceApi: SourceApi;
}

/** NSW Planning Portal API base URL */
const NSW_PLANNING_BASE =
  process.env.NSW_PLANNING_API_BASE ?? "https://api.planningportal.nsw.gov.au/v1";

/** DA Leads API base URL */
const DA_LEADS_BASE =
  process.env.DA_LEADS_API_BASE ?? "https://api.daleads.com.au/v1";

// LGAs served by the NSW Planning Portal (majority)
const NSW_PLANNING_COUNCILS = new Set([
  "blacktown",
  "blue_mountains",
  "camden",
  "campbelltown_nsw",
  "fairfield",
  "hawkesbury",
  "hills_shire",
  "liverpool",
  "parramatta",
  "penrith",
  "wollondilly",
]);

/**
 * Fetch DAs lodged in the last `sinceDaysBack` days for a single council.
 * Dispatches to the correct adapter based on whether the council is in the
 * NSW Planning Portal coverage set or the DA Leads set.
 */
export async function fetchCouncilDAs(
  councilSlug: string,
  sinceDaysBack: number,
): Promise<RawDaRecord[]> {
  await politeDelay();
  if (NSW_PLANNING_COUNCILS.has(councilSlug)) {
    return fetchNswPlanningDAs(councilSlug, sinceDaysBack);
  }
  return fetchDaLeadsDAs(councilSlug, sinceDaysBack);
}

// ─── NSW Planning Portal adapter ────────────────────────────────────────────

interface NswPlanningDA {
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

async function fetchNswPlanningDAs(
  council: string,
  sinceDaysBack: number,
): Promise<RawDaRecord[]> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDaysBack);
  const sinceStr = since.toISOString().slice(0, 10);

  const url = `${NSW_PLANNING_BASE}/development-applications?council=${encodeURIComponent(council)}&since=${sinceStr}&limit=200`;
  const apiKey = process.env.NSW_PLANNING_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  const data = await fetchWithRetry<{ applications: NswPlanningDA[] }>(url, { headers });
  const apps = data?.applications ?? [];

  return apps.map((da): RawDaRecord => ({
    daId: da.applicationNumber,
    council,
    address: da.address,
    description: da.proposedDevelopment,
    estimatedValue: da.estimatedCost ?? null,
    lodgementDate: da.lodgedDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    applicantName: da.applicant ?? null,
    portalUrl: da.url,
    rawScopeText: da.scopeDescription ?? null,
    sourceApi: "nsw_planning",
  }));
}

// ─── DA Leads / Council DA adapter ──────────────────────────────────────────

interface DaLeadsDA {
  ref: string;
  council: string;
  siteAddress: string;
  description: string;
  estimatedValue: number | null;
  lodgementDate: string;
  applicant: string | null;
  daUrl: string;
  scopeNotes: string | null;
}

async function fetchDaLeadsDAs(
  council: string,
  sinceDaysBack: number,
): Promise<RawDaRecord[]> {
  const url = `${DA_LEADS_BASE}/das?council=${encodeURIComponent(council)}&days=${sinceDaysBack}`;
  const apiKey = process.env.DA_LEADS_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const data = await fetchWithRetry<{ das: DaLeadsDA[] }>(url, { headers });
  const das = data?.das ?? [];

  return das.map((da): RawDaRecord => ({
    daId: da.ref,
    council,
    address: da.siteAddress,
    description: da.description,
    estimatedValue: da.estimatedValue ?? null,
    lodgementDate: da.lodgementDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    applicantName: da.applicant ?? null,
    portalUrl: da.daUrl,
    rawScopeText: da.scopeNotes ?? null,
    sourceApi: "council_da",
  }));
}
