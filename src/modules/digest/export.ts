// CSV export for digest leads (issue #22).
// Buyers import leads into their own CRM/spreadsheet; CSV is the v1 of the
// "get my leads out" story (full AroFlo/ServiceM8 sync deferred).
// See docs/24-market-gap-analysis-and-q3-roadmap.md (G10).
//
// Pure, dependency-free RFC 4180 writer — no csv library. The only tricky part
// is escaping (quotes, commas, newlines in free-text DA descriptions and the
// LLM "why matched" blurb), which is covered by unit tests in
// __tests__/digest/export.test.ts.
import type { DigestDetail, DigestCard } from "@/modules/portal/loaders";

// RFC 4180 §2.6/2.7: a field must be quoted if it contains a comma, a double
// quote, or a line break; embedded double quotes are escaped by doubling.
const NEEDS_QUOTING = /["\r\n,]/;

// CSV / formula injection (OWASP): Excel, Google Sheets and LibreOffice treat a
// cell whose text begins with one of these as a live formula and execute it on
// open — e.g. `=cmd|'/c calc'!A1` or a `=HYPERLINK(...)` exfil. Our free-text DA
// fields (description, address, applicant, council) come from external council
// portals and an applicant controls the lodged description, so the value is
// attacker-plantable. We neutralise by prefixing a single quote, which every
// major spreadsheet renders as a literal text marker (the standard defence).
// Tab (0x09) and CR (0x0d) are included: a leading whitespace control char can
// be stripped by the importer, re-exposing the trigger char behind it.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Escape a single value for inclusion as one CSV field (RFC 4180) and neutralise
 * spreadsheet formula injection. Nullish → empty string. Numbers are stringified
 * (never treated as formulas). A free-text value beginning with a formula-trigger
 * char is prefixed with a single quote so it opens as inert text; then fields
 * needing quoting are wrapped in double quotes with internal quotes doubled.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  // Numbers are our own, non-injectable values; stringify and skip the guard so
  // a legitimate negative estimate isn't corrupted with a leading quote.
  if (typeof value === "number") return String(value);
  const s = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  if (NEEDS_QUOTING.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Join one row of already-raw values into an escaped CSV line. */
function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(csvField).join(",");
}

const HEADER = [
  "Address",
  "Council / LGA",
  "Approval Pathway",
  "Estimated Value (AUD)",
  "Lodgement Date",
  "Relevance Score",
  "Why This Matched",
  "Description",
  "Portal URL",
  "Your Rating",
] as const;

function ratingLabel(feedback: DigestCard["userFeedback"]): string {
  if (feedback === "up") return "Thumbs up";
  if (feedback === "down") return "Thumbs down";
  return "";
}

/**
 * Render a digest's leads as an RFC 4180 CSV document (CRLF line endings).
 * An empty digest still yields a valid single-line header (columns only).
 */
export function buildDigestCsv(digest: DigestDetail): string {
  const lines: string[] = [csvRow([...HEADER])];
  for (const card of digest.cards) {
    lines.push(
      csvRow([
        card.address,
        card.council,
        card.approvalPathway ?? "",
        card.estimatedValue,
        card.lodgementDate,
        card.relevanceScore,
        card.whyMatched,
        card.description,
        card.portalUrl,
        ratingLabel(card.userFeedback),
      ]),
    );
  }
  // Trailing CRLF so the file ends on a record boundary (Excel-friendly).
  return lines.join("\r\n") + "\r\n";
}

/** Content-Disposition filename, e.g. `pi-au-digest-2026-07-05.csv`. */
export function csvFilename(runDate: string): string {
  // runDate is already an ISO date (YYYY-MM-DD) from the loader; guard anyway.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(runDate) ? runDate : runDate.slice(0, 10);
  return `pi-au-digest-${date}.csv`;
}
