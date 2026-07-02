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

export type SourceApi =
  | "nsw_planning"
  | "da_leads"
  | "council_da"
  | "da_exhibitions"
  | "ssd_register" // State Significant Development register (Teams-tier — dormant for now)
  | "plansa"; // South Australia PlanSA ArcGIS register (Wave 2 — dormant behind SA_INGEST_ENABLED)

/** Normalised DA record after adapting from any source. */
export interface RawDaRecord {
  daId: string; // Council-issued DA reference number
  council: string; // council slug (matches lgas.id)
  address: string;
  description: string;
  estimatedValue: number | null;
  lodgementDate: string; // yyyy-mm-dd
  // Determined DAs only — the council's decision date. Used by the freshness
  // filter to drop years-old approvals that are no longer roofer-actionable.
  determinationDate: string | null; // yyyy-mm-dd
  applicantName: string | null;
  portalUrl: string;
  rawScopeText: string | null;
  sourceApi: SourceApi;
}

/**
 * Maximum age (in days) that an ingested DA can have before it's considered
 * dead-lead territory. NSW residential DAs lapse after 5 years if not
 * commenced; by the time we're 6 months past determination the head
 * contractor has procured trades, and the roofer's window is past.
 */
const FRESHNESS_WINDOW_DAYS = 180;

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
    determinationDate: null,
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
    determinationDate: null,
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
  /** Categorical e.g. "Alterations and additions to residential development". Coarse. */
  developmentTypeText: string | null;
  /** Free-text scope e.g. "Ground floor alterations and first floor addition to existing dwelling". Richer than developmentTypeText. */
  projectDescription: string | null;
  exhibitionStart: string | null;
  exhibitionEnd: string | null;
  consentAuthority: string | null;
  /** Determined-status DAs only. Approved | Refused | Deferred Commencement Consent | … */
  decision: string | null;
  /** Determined-status DAs only. yyyy-mm-dd. Used for the freshness filter. */
  determinationDate: string | null;
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
      // Detail-page path varies by status: /daex/exhibition/, /daex/under-consideration/,
      // /daex/determined/, etc. Match any /daex/<path>/ link.
      detailHref: $card.find('a[href^="/daex/"]').first().attr("href") ?? null,
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

  // Decision: only present on Determined detail pages. Robust extraction
  // direct from the field class — the label/value scan above sometimes
  // misses it because the "Decision" label and value are adjacent <div>s
  // without a strong/b/dt wrapper.
  const decisionEl = $(".field-field-decision").first();
  const decision = decisionEl.length > 0 ? decisionEl.text().trim() || null : (rows["Decision"] ?? null);

  // Determination date: only present on Determined detail pages. The page
  // renders "Determination date: 15/02/2023" — same dd/mm/yyyy format as
  // every other date on this site. Try the field-class first; fall back
  // to the row scan.
  const determinationEl = $(".field-field-determination-date").first();
  const determinationRaw =
    (determinationEl.length > 0 ? determinationEl.text().trim() : "") ||
    rows["Determination date"] ||
    "";
  const determinationDate = parseAuDate(determinationRaw);

  // Project description: the free-text scope blob, much richer than the
  // categorical "Type of development". Lives in a separate field class.
  // Example value: "Ground floor alterations and first floor addition to
  // existing dwelling." vs Type of development which would just say
  // "Alterations and additions to residential development".
  const descriptionEl = $(".field-field-project-description").first();
  const projectDescription = descriptionEl.length > 0 ? descriptionEl.text().trim() || null : null;

  return {
    propertyAddress: rows["Property Address"] ?? rows["Property address"] ?? null,
    developmentTypeText: rows["Type of development"] ?? null,
    projectDescription,
    exhibitionStart: parseAuDate(start),
    exhibitionEnd: parseAuDate(end),
    consentAuthority: rows["Consent authority name"] ?? null,
    decision,
    determinationDate,
  };
}

/**
 * Decide whether a Determined DA is roofer-actionable. Only "approved"
 * outcomes lead to construction; "Refused"/"Withdrawn"/etc. are dead leads.
 *
 * Known values seen on the Portal:
 *   - "Approved"                          → keep
 *   - "Approved with Conditions"          → keep
 *   - "Deferred Commencement Consent"     → keep (approved subject to pre-conditions)
 *   - "Refused"                           → drop
 *   - "Withdrawn"                         → drop
 *   - "Rejected"                          → drop
 *
 * If the field is missing or unrecognised, default to keeping the record —
 * better to surface a possibly-stale lead than silently drop unfamiliar
 * data. The LLM rerank scores it by relevance regardless.
 */
function isApprovedDecision(decision: string | null | undefined): boolean {
  if (!decision) return true;
  const normalised = decision.toLowerCase();
  if (/refus|withdraw|reject|dismiss/i.test(normalised)) return false;
  return true;
}

/**
 * DAEX statuses we ingest. Form values verified against the live
 * `<select name="field_daex_status_value">` dropdown on 2026-04-30.
 * The display label is "Made and Finalised" but the value is
 * "Made Finalised" (no "and") — caught this in production and removed
 * because it returns 0 records across our 15 LGAs anyway.
 *
 * "On Exhibition" alone is too narrow — only 14–28 day public-comment
 * windows are exhibited, so most LGAs return 0 on any given day.
 * Adding "Under Consideration" (lodged, reviewing) and "Determined"
 * (approved, ready for construction) captures the bulk of roofer-
 * actionable lead volume:
 *   Cumberland: 15 + 242 + 994 = 1251 records
 *   Parramatta: 0 + 13 + 252 = 265
 *
 * "LEC Determined" + "LEC Consideration" are excluded — those are
 * Land and Environment Court cases, not standard pipeline.
 */
const DAEX_STATUSES = [
  "On Exhibition",
  "Under Consideration",
  "Determined",
];

async function fetchDaExhibitionsByLga(
  slug: string,
  _sinceDaysBack: number,
): Promise<RawDaRecord[]> {
  // sinceDaysBack is intentionally ignored for DAEX — the status filters
  // already constrain to actionable DAs. Filtering on lodgement date too
  // would double-filter and drop valid records, especially since the
  // listing isn't strictly date-desc.
  const lgaValue = DAEX_LGA_VALUES[slug];
  if (!lgaValue) return [];

  const records: RawDaRecord[] = [];
  // Use today's date as a fallback lodgementDate when the detail page
  // doesn't expose exhibitionStart. The downstream rule filter at
  // src/modules/relevance/filters.ts looks back 7 days, so giving every
  // record a fresh date keeps them in the digest candidate set.
  const today = isoDate(0);
  const seen = new Set<string>();

  for (const status of DAEX_STATUSES) {
    const statusRecords = await fetchDaExhibitionsByStatus(slug, lgaValue, status, today, seen);
    records.push(...statusRecords);
  }

  return records;
}

async function fetchDaExhibitionsByStatus(
  slug: string,
  lgaValue: string,
  status: string,
  today: string,
  seen: Set<string>,
): Promise<RawDaRecord[]> {
  const records: RawDaRecord[] = [];
  // Cap pages per status so a single LGA in a populous status (e.g. Cumberland
  // had 1300+ Under Consideration) doesn't burn the whole cron's budget.
  const MAX_PAGES_PER_STATUS = 5;

  for (let page = 0; page < MAX_PAGES_PER_STATUS; page++) {
    const url =
      `${DAEX_BASE}/daexhibitions` +
      `?field_local_government_area_value=${encodeURIComponent(lgaValue)}` +
      `&field_daex_status_value=${encodeURIComponent(status)}` +
      `&page=${page}`;
    const html = await fetchTextWithRetry(url, { headers: { "User-Agent": DAEX_USER_AGENT } });
    const rows = parseDaexListing(html);
    if (rows.length === 0) break;

    for (const row of rows) {
      // Use PAN as the canonical id when present; fall back to DA number.
      const daId = row.panNumber ?? row.daNumber;
      if (!daId || !row.detailHref) continue;
      // Multi-status fetch can return the same DA twice if Stripe pagination
      // overlaps; dedupe by (council, daId).
      const dedupeKey = `${slug}:${daId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const detailUrl = row.detailHref.startsWith("http")
        ? row.detailHref
        : `${DAEX_BASE}${row.detailHref}`;

      // Eager enrichment — fetch the detail page for address + scope text.
      // ~1 detail fetch per listing row; politeDelay enforces ≥500ms cadence.
      let detail: DaexDetailFields = {
        propertyAddress: null,
        developmentTypeText: null,
        projectDescription: null,
        exhibitionStart: null,
        exhibitionEnd: null,
        consentAuthority: null,
        decision: null,
        determinationDate: null,
      };
      try {
        const detailHtml = await fetchTextWithRetry(detailUrl, { headers: { "User-Agent": DAEX_USER_AGENT } });
        detail = parseDaexDetail(detailHtml);
      } catch {
        // Detail-page fetch failed; carry on with listing-only fields.
      }

      // Skip Refused/Withdrawn determinations. These are dead leads — the
      // project isn't going ahead, no roofer will be hired. We deliberately
      // keep "Approved", "Approved with Conditions", and "Deferred
      // Commencement Consent" since all three lead to actual construction.
      if (status === "Determined" && !isApprovedDecision(detail.decision)) {
        continue;
      }

      // Stale-DA filter. The "freshness signal" depends on status:
      //   - Determined: determinationDate (council decided years ago = dead).
      //   - On Exhibition / Under Consideration: exhibitionStart (when public
      //     consultation opened — close enough to "in progress" for our
      //     window). exhibitionStart is sometimes null for under-consideration
      //     records that never went on exhibition; in that case we accept the
      //     record (status itself is a strong recency signal — the council
      //     has it open right now).
      const freshnessSignal =
        status === "Determined" ? detail.determinationDate : detail.exhibitionStart;
      if (status === "Determined" && !freshnessSignal) {
        // Determined but no determination date → can't bound freshness.
        // Drop it — better to miss a few than pollute with 3-year-old leads.
        continue;
      }
      if (freshnessSignal && isOlderThan(freshnessSignal, FRESHNESS_WINDOW_DAYS)) {
        continue;
      }

      // description: prefer the listing title (most readable), fall back to
      // the free-text project description if the title was empty (some
      // councils render only an address — see The Hills Shire).
      // rawScopeText: fold the richer free-text scope onto the categorical
      // type-of-development so the LLM rerank sees both. Stage-1 ts_vector
      // and the LLM both consume this field.
      const description = row.title?.trim() || detail.projectDescription || "";
      const scopeParts = [detail.developmentTypeText, detail.projectDescription, row.title]
        .filter((s): s is string => Boolean(s?.trim()))
        // Dedupe — sometimes the title equals the project description.
        .filter((s, i, arr) => arr.indexOf(s) === i);
      const rawScopeText = scopeParts.join(". ") || null;

      // lodgementDate: prefer the determination date for Determined DAs (it's
      // the most recent meaningful event we have); otherwise the exhibition
      // start date. The today-fallback is the floor — only used when neither
      // signal is available, which after the freshness gate above only
      // happens for Under Consideration records the listing exposes without
      // any date at all (rare but valid).
      const lodgementDate =
        (status === "Determined" ? detail.determinationDate : detail.exhibitionStart) ??
        today;

      records.push({
        daId,
        council: slug,
        address: detail.propertyAddress ?? row.title ?? "",
        description,
        estimatedValue: null, // not exposed by DA Exhibitions
        lodgementDate,
        determinationDate: detail.determinationDate,
        applicantName: null, // not exposed by DA Exhibitions
        portalUrl: detailUrl,
        rawScopeText,
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

/**
 * True iff `iso` (yyyy-mm-dd) is more than `windowDays` ago. Used by the
 * ingest freshness gate to drop years-old determined DAs at write time.
 */
function isOlderThan(iso: string, windowDays: number): boolean {
  const d = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(d)) return false; // unparseable → don't claim it's stale
  const ageDays = (Date.now() - d) / (1000 * 60 * 60 * 24);
  return ageDays > windowDays;
}

// ─── State Significant Development register (Teams-tier; dormant) ───────────
//
// Lives at planningportal.nsw.gov.au/major-projects/projects. Different
// schema from /daexhibitions:
//   - Listing card: SSD-NNNNNNNN case_id + status tag + project title + LGA + address
//     + detail link (/major-projects/projects/<slug>)
//   - Detail page: Application Number, Assessment Type, Development Type
//     (e.g. "HDA Housing"), LGAs, Exhibition Start-End Date, Contact Planner
//     Name + Phone, full project description, attachments section
//
// Coverage on snapshot 2026-04-30: 9627 results across all NSW LGAs and
// statuses. Volume per LGA varies — ~50–200 active projects per metro LGA.
//
// NOT wired into fetchCouncilDAs(). Flip SSD_INGEST_ENABLED=true and call
// fetchSsdProjects() directly from a Teams-tier cron when that tier ships.

const SSD_BASE = `${DAEX_BASE}/major-projects/projects`;

interface SsdListingRow {
  caseId: string | null;
  caseType: string | null;
  status: string | null;
  title: string | null;
  lga: string | null;
  address: string | null;
  detailHref: string | null;
}

interface SsdDetailFields {
  applicationNumber: string | null;
  assessmentType: string | null;
  developmentType: string | null;
  lgaList: string[];
  exhibitionStart: string | null;
  exhibitionEnd: string | null;
  contactPlannerName: string | null;
  contactPlannerPhone: string | null;
  projectDescription: string | null;
}

export function parseSsdListing(html: string): SsdListingRow[] {
  const $ = cheerio.load(html);
  return $("div.card")
    .map((_, card): SsdListingRow => {
      const $card = $(card);
      // Status tag: the colored "Exhibition" / "Determined" pill, distinct
      // from the case-type tag below it.
      const status = $card.find(".tag--red.tag--fixed, .tag--green.tag--fixed, .tag--blue.tag--fixed")
        .first().text().trim() || null;
      // LGA appears in a <span class="card__sub"> just before the title.
      const lga = $card.find(".card__sub").first().text().trim() || null;
      // Address sits in the same <div> as .icon--pin, like DAEX cards do.
      const $pin = $card.find(".icon--pin").first();
      const address = $pin.length > 0 ? $pin.parent().text().trim() || null : null;
      return {
        caseId: textOrNull($card.find(".field-field-case-id").first()),
        caseType: textOrNull($card.find(".field-field-case-type").first()),
        status,
        title: textOrNull($card.find(".card__title").first()),
        lga,
        address,
        detailHref: $card.find('a[href^="/major-projects/projects/"]').first().attr("href") ?? null,
      };
    })
    .get();
}

export function parseSsdDetail(html: string): SsdDetailFields {
  const $ = cheerio.load(html);

  // SSD detail page uses <div class="row--small"><b>label</b><div>value</div></div>
  // for every project-details row. Walk those.
  const rows: Record<string, string> = {};
  $("div.row--small").each((_, el) => {
    const $row = $(el);
    const label = $row.find("b").first().text().trim();
    if (!label) return;
    // Value is the trailing <div> sibling of the <b>. Pick the last <div> in
    // the row to skip nested label-wrapper divs.
    const valueDiv = $row.find("> div, > b > div").last();
    const value = valueDiv.text().trim();
    if (label && value && !rows[label]) rows[label] = value;
  });

  // Exhibition window: the value div has two <time> elements separated by " - ".
  // After .text() they collapse to e.g. "21/04/2026 - 07/05/2026".
  const exhibition = rows["Exhibition Start-End Date"] ?? "";
  const [start, end] = exhibition.split(/\s*-\s*/).map((s) => s?.trim() ?? "");

  // Class-keyed fields are more reliable than label/value scan when present.
  const projectDescriptionEl = $(".field-field-project-description").first();
  const projectDescription = projectDescriptionEl.length > 0
    ? projectDescriptionEl.text().trim() || null
    : null;
  const applicationNumber =
    $(".field-field-case-id").first().text().trim() || rows["Application Number"] || null;

  // LGAs may be a comma-separated list for projects spanning council boundaries
  // (e.g. linear infrastructure). Most SSDs are single-council.
  const lgaRaw = rows["Local Government Areas"] ?? rows["Local Government Area"] ?? "";
  const lgaList = lgaRaw.split(",").map((s) => s.trim()).filter(Boolean);

  return {
    applicationNumber: applicationNumber || null,
    assessmentType: rows["Assessment Type"] ?? null,
    developmentType: rows["Development Type"] ?? null,
    lgaList,
    exhibitionStart: parseAuDate(start),
    exhibitionEnd: parseAuDate(end),
    // Contact Planner section uses bare "Name" and "Phone" labels.
    contactPlannerName: rows["Name"] ?? null,
    contactPlannerPhone: rows["Phone"] ?? null,
    projectDescription,
  };
}

/**
 * Fetch State Significant Development projects for an LGA. Filters at the
 * listing level by `lga` query param. Each detail page enrichment surfaces
 * the rich project description plus (notably) the contact planner's name
 * and phone — fields we don't have in DAEX, useful for tier-2 builder
 * outreach.
 *
 * Off by default (env.SSD_INGEST_ENABLED). Wire this into a future
 * Teams-tier cron rather than fetchCouncilDAs() so the residential roofer
 * digest doesn't get polluted with hospital-scale projects.
 */
export async function fetchSsdProjects(
  lgaName: string,
  opts: { maxPages?: number } = {},
): Promise<RawDaRecord[]> {
  if (!env.SSD_INGEST_ENABLED) return [];

  const records: RawDaRecord[] = [];
  const maxPages = opts.maxPages ?? 5;
  const today = isoDate(0);

  for (let page = 0; page < maxPages; page++) {
    const url =
      `${SSD_BASE}?lga=${encodeURIComponent(lgaName)}&page=${page}`;
    const html = await fetchTextWithRetry(url, { headers: { "User-Agent": DAEX_USER_AGENT } });
    const rows = parseSsdListing(html);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.caseId || !row.detailHref) continue;
      const detailUrl = row.detailHref.startsWith("http")
        ? row.detailHref
        : `${DAEX_BASE}${row.detailHref}`;

      let detail: SsdDetailFields | null = null;
      try {
        const detailHtml = await fetchTextWithRetry(detailUrl, {
          headers: { "User-Agent": DAEX_USER_AGENT },
        });
        detail = parseSsdDetail(detailHtml);
      } catch {
        // Carry on with listing-only fields.
      }

      const description = row.title?.trim() || detail?.projectDescription || "";
      const scopeParts = [detail?.developmentType, detail?.projectDescription, row.title]
        .filter((s): s is string => Boolean(s?.trim()))
        .filter((s, i, arr) => arr.indexOf(s) === i);

      records.push({
        daId: row.caseId,
        council: row.lga ?? lgaName,
        address: row.address ?? "",
        description,
        estimatedValue: null, // not exposed by SSD register
        lodgementDate: detail?.exhibitionStart ?? today,
        determinationDate: null, // SSD register doesn't expose a determination date
        applicantName: detail?.contactPlannerName ?? null,
        portalUrl: detailUrl,
        rawScopeText: scopeParts.join(". ") || null,
        sourceApi: "ssd_register",
      });

      await politeDelay();
    }

    if (rows.length < 9) break; // partial page → no more
    await politeDelay();
  }

  return records;
}
