// Data source adapters for the DA ingestion pipeline.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// contract: security.public_data_only = true
//
// Only public endpoints listed in system-design §2 "ingestion" component.
// DO NOT add Cordell, LeadManager, or EstimateOne (contract.security.public_data_only).
import * as cheerio from "cheerio";
import { fetchWithRetry, fetchTextWithRetry, politeDelay } from "./fetch";
import { env } from "@/lib/env";

export type SourceApi = "nsw_planning" | "da_leads" | "council_da" | "da_exhibitions";

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
const NSW_PLANNING_BASE = env.NSW_PLANNING_API_BASE;

/** DA Leads API base URL */
const DA_LEADS_BASE = env.DA_LEADS_API_BASE;

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
 * Fetch DAs for a single council in the last `sinceDaysBack` days.
 *
 * Adapter precedence:
 *   1. DA Exhibitions HTML scrape (when DAEX_INGEST_ENABLED=true) — covers all
 *      15 LGAs from the public NSW Planning Portal register. No API key, eager
 *      enrichment from detail pages.
 *   2. NSW Planning Portal API — only when NSW_PLANNING_API_KEY is set, for
 *      councils in NSW_PLANNING_COUNCILS. Authoritative source (FR-001).
 *   3. DA Leads / council DA API — only when DA_LEADS_API_KEY is set.
 *   4. No-op (returns []) when no source is configured for this slug. Avoids
 *      DNS-resolving the placeholder URLs (api.planningportal.nsw.gov.au/v1
 *      and api.daleads.com.au) which don't exist as real endpoints — each
 *      4-attempt retry burns ~14s and 15 councils × that = 524 timeout.
 *
 * The pipeline accepts records from any source via the `source_api` column,
 * so swapping order (e.g. once an NSW Planning key arrives, demote scraping)
 * needs no DB migration.
 */
export async function fetchCouncilDAs(
  councilSlug: string,
  sinceDaysBack: number,
): Promise<RawDaRecord[]> {
  await politeDelay();
  if (env.DAEX_INGEST_ENABLED && DAEX_LGA_VALUES[councilSlug]) {
    return fetchDaExhibitionsByLga(councilSlug, sinceDaysBack);
  }
  if (env.NSW_PLANNING_API_KEY && NSW_PLANNING_COUNCILS.has(councilSlug)) {
    return fetchNswPlanningDAs(councilSlug, sinceDaysBack);
  }
  if (env.DA_LEADS_API_KEY) {
    return fetchDaLeadsDAs(councilSlug, sinceDaysBack);
  }
  return [];
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
  const apiKey = env.NSW_PLANNING_API_KEY;
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
  const apiKey = env.DA_LEADS_API_KEY;
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

// ─── DA Exhibitions adapter (HTML scrape) ───────────────────────────────────
// Public NSW Planning Portal register at /daexhibitions. Filterable by LGA
// via Drupal-form GET param. Listing pages give us PAN/DA number/title/council;
// detail pages add property address, type-of-development scope text, and the
// exhibition window. No API key required.
//
// Coverage notes (snapshot 2026-04-30): "On Exhibition" status is a narrow
// window (typically 14–28 days), so any single LGA may have 0 records on a
// given day. Cumberland was the only one of our 15 with active exhibitions
// at this moment. This adapter is meant to coexist with the manual-import
// path; both flow through development_applications.

const DAEX_BASE = "https://www.planningportal.nsw.gov.au";
const DAEX_USER_AGENT = "ProjectIntelligence-AU/1.0 (+https://www.pi-au.com)";

/**
 * Council-slug → DAEX dropdown value. Slug keys MUST match
 * ALL_COUNCIL_SLUGS in src/modules/ingestion/ingest.ts and the LGAS
 * seed in prisma/seed.ts. Dropdown values verified by inspecting
 * `<select name="field_local_government_area_value">` on the
 * /daexhibitions form on 2026-04-30.
 */
const DAEX_LGA_VALUES: Record<string, string> = {
  // Western Sydney
  blacktown: "BLACKTOWN",
  cumberland: "CUMBERLAND",
  parramatta: "CITY OF PARRAMATTA",
  penrith: "PENRITH",
  the_hills: "THE HILLS SHIRE",
  // Inner West & City
  burwood: "BURWOOD",
  canada_bay: "CANADA BAY",
  city_of_sydney: "SYDNEY",
  inner_west: "INNER WEST",
  // Northern Sydney
  hornsby: "HORNSBY",
  ku_ring_gai: "KU-RING-GAI",
  northern_beaches: "NORTHERN BEACHES",
  // Southern Sydney
  bayside: "BAYSIDE",
  georges_river: "GEORGES RIVER",
  sutherland: "SUTHERLAND SHIRE",
};

interface DaexListingRow {
  panNumber: string | null;
  daNumber: string | null;
  applicationType: string | null;
  status: string | null;
  title: string | null;
  council: string | null;
  detailHref: string | null;
}

interface DaexDetailFields {
  propertyAddress: string | null;
  developmentTypeText: string | null;
  exhibitionStart: string | null;
  exhibitionEnd: string | null;
  consentAuthority: string | null;
}

/**
 * Parse the listing HTML for one /daexhibitions page. Pure function — takes
 * a string of HTML and returns rows. Tested against fixtures captured on
 * 2026-04-30; brittle to NSW Planning Portal redesigns.
 */
export function parseDaexListing(html: string): DaexListingRow[] {
  const $ = cheerio.load(html);
  return $("div.card").map((_, card): DaexListingRow => {
    const $card = $(card);
    return {
      panNumber: textOrNull($card.find(".field-field-panel-reference-number").first()),
      daNumber: textOrNull($card.find(".field-field-council-unique-number").first()),
      applicationType: textOrNull($card.find(".field-field-application-type").first()),
      status: textOrNull($card.find(".field-field-daex-status").first()) ?? textOrNull($card.find(".tag--fixed").first()),
      title: textOrNull($card.find(".card__title").first()),
      // Council name is a free text node sandwiched after the icon--pin span.
      council: extractCouncilLabel($card),
      detailHref: $card.find('a[href*="/daex/exhibition/"]').first().attr("href") ?? null,
    };
  }).get();
}

/**
 * Parse a /daex/exhibition/{slug} detail page. Handles the on-exhibition
 * shape (Project Details section with Property Address, Type of development,
 * Exhibition start - end date).
 */
export function parseDaexDetail(html: string): DaexDetailFields {
  const $ = cheerio.load(html);
  const rows: Record<string, string> = {};
  // Project-details labels are sibling text nodes; the simplest, structure-
  // tolerant approach is to grab every label/value pair the page renders.
  $("strong, b, dt, label").each((_, el) => {
    const label = $(el).text().trim();
    const value = $(el).next().text().trim() || $(el).parent().next().text().trim();
    if (label && value) rows[label] = value;
  });
  // Fall back to a broader text-pair scan: the `Project Details` section
  // renders each "label\nvalue" pair as adjacent <div>s.
  $(".spacing--bottom-m").each((_, sec) => {
    const lines = $(sec)
      .text()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (let i = 0; i + 1 < lines.length; i++) {
      const next = lines[i + 1];
      if (lines[i] && next && !rows[lines[i]!]) rows[lines[i]!] = next;
    }
  });

  const exhibition = rows["Exhibition start - end date"] ?? "";
  const [start, end] = exhibition.split(/\s*-\s*/).map((s) => s?.trim() ?? "");
  return {
    propertyAddress: rows["Property Address"] ?? rows["Property address"] ?? null,
    developmentTypeText: rows["Type of development"] ?? null,
    exhibitionStart: parseAuDate(start),
    exhibitionEnd: parseAuDate(end),
    consentAuthority: rows["Consent authority name"] ?? null,
  };
}

async function fetchDaExhibitionsByLga(
  slug: string,
  sinceDaysBack: number,
): Promise<RawDaRecord[]> {
  const lgaValue = DAEX_LGA_VALUES[slug];
  if (!lgaValue) return [];
  const sinceStr = isoDate(-sinceDaysBack);

  const records: RawDaRecord[] = [];
  const MAX_PAGES = 20;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `${DAEX_BASE}/daexhibitions` +
      `?field_local_government_area_value=${encodeURIComponent(lgaValue)}` +
      `&field_daex_status_value=${encodeURIComponent("On Exhibition")}` +
      `&page=${page}`;
    const html = await fetchTextWithRetry(url, { headers: { "User-Agent": DAEX_USER_AGENT } });
    const rows = parseDaexListing(html);
    if (rows.length === 0) break;

    for (const row of rows) {
      // Use PAN as the canonical id when present; fall back to DA number.
      const daId = row.panNumber ?? row.daNumber;
      if (!daId || !row.detailHref) continue;

      const detailUrl = row.detailHref.startsWith("http")
        ? row.detailHref
        : `${DAEX_BASE}${row.detailHref}`;

      // Eager enrichment — fetch the detail page for address + scope text.
      // ~1 detail fetch per listing row; politeDelay enforces ≥500ms cadence.
      let detail: DaexDetailFields = {
        propertyAddress: null,
        developmentTypeText: null,
        exhibitionStart: null,
        exhibitionEnd: null,
        consentAuthority: null,
      };
      try {
        const detailHtml = await fetchTextWithRetry(detailUrl, { headers: { "User-Agent": DAEX_USER_AGENT } });
        detail = parseDaexDetail(detailHtml);
      } catch {
        // Detail-page fetch failed; carry on with listing-only fields.
      }

      const lodgement = detail.exhibitionStart ?? sinceStr;
      // Listing is roughly date-desc by exhibition start; once we cross the
      // window, stop paginating.
      if (lodgement < sinceStr) return records;

      records.push({
        daId,
        council: slug,
        address: detail.propertyAddress ?? row.title ?? "",
        description: row.title ?? "",
        estimatedValue: null, // not exposed by DA Exhibitions
        lodgementDate: lodgement,
        applicantName: null, // not exposed by DA Exhibitions
        portalUrl: detailUrl,
        rawScopeText: detail.developmentTypeText ?? row.title ?? null,
        sourceApi: "da_exhibitions",
      });

      await politeDelay();
    }

    if (rows.length < 10) break; // partial page → no more results
    await politeDelay();
  }

  return records;
}

// ─── Helpers (DA Exhibitions parsing) ───────────────────────────────────────

function textOrNull($el: ReturnType<cheerio.CheerioAPI>): string | null {
  const t = $el.text().trim();
  return t.length === 0 ? null : t;
}

function extractCouncilLabel($card: ReturnType<cheerio.CheerioAPI>): string | null {
  // The council name lives in the same <div> as the .icon--pin span, after
  // the icon. Pull the parent <div>'s text and trim the icon away.
  const $pin = $card.find(".icon--pin").first();
  if ($pin.length === 0) return null;
  const parentText = $pin.parent().text().trim();
  return parentText.length === 0 ? null : parentText;
}

function parseAuDate(au: string | undefined): string | null {
  // Convert dd/mm/yyyy → yyyy-mm-dd
  if (!au) return null;
  const m = au.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
