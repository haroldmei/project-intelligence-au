// Development-type category audit — pure classification + counting logic for
// scripts/audit-development-types.ts (issue #26, expansion Wave 0).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies.
//
// The expansion trade-pick (docs/25 §1.1) assumes NSW DA/CDC records carry
// cleanly filterable development-type categories for demolition / pools /
// subdivision. The research flagged the exact enum strings as low-confidence.
// This module turns our stored rows into evidence:
//   (a) which distinct development_type values we actually persist, with counts;
//   (b) per-candidate-trade match rates, both via free-text vocabulary (the
//       baseline the pipeline uses today) and via the persisted category enum
//       (the cheaper filter the trade-pick is betting on).
//
// PURE — no DB / env / fs / model imports, so the classification logic is
// fixture-tested without a live DB (backend gate constraint). The script layer
// (audit-development-types.ts) owns the Prisma read + file write.
import { getRegisteredPack, type VerticalPack } from "@/verticals";

/** The minimal slice of a development_applications row the audit reads. */
export interface AuditRow {
  developmentType: string | null;
  description: string;
  rawScopeText: string | null;
}

/** A distinct development_type value and how many rows carry it. */
export interface ValueCount {
  /** The stored value, or the NONE_LABEL sentinel for null/blank. */
  value: string;
  count: number;
}

/** Sentinel bucket for rows with no persisted development_type. */
export const NONE_LABEL = "(none — not persisted)";

/**
 * A candidate trade filter. `keywords` is the free-text vocabulary matched
 * against description + rawScopeText + developmentType (the recall-first signal
 * the pipeline uses today). `categoryCandidates` are the low-confidence
 * development_type enum strings the trade-pick hopes to filter on — matched
 * against the persisted category alone.
 */
export interface TradeFilter {
  label: string;
  keywords: string[];
  categoryCandidates: string[];
}

/** Per-trade match evidence over the scanned rows. */
export interface TradeMatchRate {
  label: string;
  total: number;
  /** Rows matched by free-text vocabulary (description + scope + category). */
  textMatched: number;
  textRate: number;
  /** Rows whose persisted development_type matched a categoryCandidate. */
  categoryMatched: number;
  /** categoryMatched / rows-with-a-persisted-category (0 when none persisted). */
  categoryRateOfPersisted: number;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

/** True iff `value` is a real persisted category (non-null, non-blank). */
function hasCategory(row: AuditRow): boolean {
  return Boolean(row.developmentType && row.developmentType.trim());
}

/**
 * Distinct development_type values with counts, most-common first. Null/blank
 * rows collapse into a single NONE_LABEL bucket so the coverage gap is visible
 * rather than hidden. Ties break alphabetically for a stable, diffable report.
 */
export function countDevelopmentTypes(rows: AuditRow[]): ValueCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = hasCategory(row) ? row.developmentType!.trim() : NONE_LABEL;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** How many scanned rows carry any persisted development_type. */
export function persistedCategoryCount(rows: AuditRow[]): number {
  return rows.filter(hasCategory).length;
}

/** True iff any keyword appears in the row's combined free text. */
function textMatches(row: AuditRow, keywords: string[]): boolean {
  const haystack = `${norm(row.description)} ${norm(row.rawScopeText)} ${norm(row.developmentType)}`;
  return keywords.some((k) => {
    const term = k.trim().toLowerCase();
    return term.length > 0 && haystack.includes(term);
  });
}

/** True iff the row's persisted category contains any candidate string. */
function categoryMatches(row: AuditRow, categoryCandidates: string[]): boolean {
  if (!hasCategory(row)) return false;
  const cat = norm(row.developmentType);
  return categoryCandidates.some((c) => {
    const term = c.trim().toLowerCase();
    return term.length > 0 && cat.includes(term);
  });
}

/** Compute both text- and category-based match rates for one candidate trade. */
export function tradeMatchRate(rows: AuditRow[], filter: TradeFilter): TradeMatchRate {
  const total = rows.length;
  const persisted = persistedCategoryCount(rows);
  let textMatched = 0;
  let categoryMatched = 0;
  for (const row of rows) {
    if (textMatches(row, filter.keywords)) textMatched++;
    if (categoryMatches(row, filter.categoryCandidates)) categoryMatched++;
  }
  return {
    label: filter.label,
    total,
    textMatched,
    textRate: total > 0 ? textMatched / total : 0,
    categoryMatched,
    categoryRateOfPersisted: persisted > 0 ? categoryMatched / persisted : 0,
  };
}

function packVocabulary(pack: VerticalPack | undefined): string[] {
  if (!pack) return [];
  return [...pack.vocabulary.explicit, ...pack.vocabulary.implicit];
}

/**
 * The candidate trade filters the trade-pick needs evidence on (docs/25 §1.1):
 * demolition, swimming pool, subdivision/earthworks — plus roofing (V1) as the
 * baseline. Roofing + demolition reuse their registered vertical-pack vocabulary
 * and development-type filters so the audit reflects the live packs, not a fork.
 * Pools and subdivision have no pack yet, so their candidate vocabularies are
 * defined here (and this is exactly the evidence that decides whether they earn
 * one).
 */
export function candidateFilters(): TradeFilter[] {
  const roofing = getRegisteredPack("roofing");
  const demolition = getRegisteredPack("demolition");

  return [
    {
      // Baseline: roofing is vocabulary-only (no clean NSW category — docs/25 §1.1).
      label: "roofing (V1 baseline)",
      keywords: packVocabulary(roofing),
      categoryCandidates: roofing?.developmentTypeFilters ?? [],
    },
    {
      label: "demolition",
      keywords: packVocabulary(demolition),
      categoryCandidates: demolition?.developmentTypeFilters ?? [],
    },
    {
      label: "swimming pool",
      keywords: [
        "swimming pool",
        "pool",
        "in-ground pool",
        "inground pool",
        "above ground pool",
        "spa",
        "pool and spa",
        "pool fence",
        "pool barrier",
      ],
      // Low-confidence NSW category guesses — the audit verifies these.
      categoryCandidates: ["swimming pool", "pool", "swimming pool and spa"],
    },
    {
      label: "subdivision / earthworks",
      keywords: [
        "subdivision",
        "subdivide",
        "torrens title subdivision",
        "strata subdivision",
        "boundary adjustment",
        "earthworks",
        "bulk earthworks",
        "excavation",
        "civil works",
        "roadworks",
        "retaining wall",
        "land division",
      ],
      categoryCandidates: [
        "subdivision",
        "subdivision of land",
        "torrens title subdivision",
        "strata subdivision",
        "earthworks",
      ],
    },
  ];
}

export interface AuditReport {
  runDate: string;
  totalRows: number;
  persistedCategories: number;
  valueCounts: ValueCount[];
  tradeRates: TradeMatchRate[];
}

/** Run the full audit over a set of rows. */
export function auditDevelopmentTypes(rows: AuditRow[], runDate: string): AuditReport {
  return {
    runDate,
    totalRows: rows.length,
    persistedCategories: persistedCategoryCount(rows),
    valueCounts: countDevelopmentTypes(rows),
    tradeRates: candidateFilters().map((f) => tradeMatchRate(rows, f)),
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/**
 * Render the audit as a human-readable Markdown report. `generatedBy` is stamped
 * in the header so the committed docs/25b file declares its provenance; the
 * script passes the run date (from a CLI arg or the system clock). An optional
 * `note` line documents the data source (e.g. "sample run over seeded rows") so
 * a checked-in snapshot isn't mistaken for a production audit — empty on real
 * prod runs.
 */
export function renderReport(report: AuditReport, generatedBy: string, note = ""): string {
  const { runDate, totalRows, persistedCategories, valueCounts, tradeRates } = report;
  const coverage = totalRows > 0 ? persistedCategories / totalRows : 0;

  const lines: string[] = [];
  lines.push("# Development-type category audit — expansion Wave 0");
  lines.push("");
  lines.push(`> Generated by \`${generatedBy}\` on ${runDate}. Do not edit by hand —`);
  lines.push("> re-run the script to refresh. Evidence for the docs/25 §1.1 trade pick.");
  if (note.trim()) {
    lines.push(">");
    lines.push(`> **Data source:** ${note.trim()}`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Rows scanned:** ${totalRows}`);
  lines.push(
    `- **Rows with a persisted \`development_type\`:** ${persistedCategories} (${pct(coverage)})`,
  );
  if (persistedCategories === 0) {
    lines.push(
      "- ⚠️ **No rows carry a development-type category yet.** The column landed with #26;" +
        " existing rows backfill to a category only as they are re-ingested. Category match" +
        " rates below are therefore 0 until the feeds re-run — the free-text rates are the" +
        " live signal in the meantime.",
    );
  }
  lines.push("");

  lines.push("## Distinct `development_type` values");
  lines.push("");
  lines.push("| value | count |");
  lines.push("| --- | ---: |");
  for (const { value, count } of valueCounts) {
    lines.push(`| ${escapeCell(value)} | ${count} |`);
  }
  lines.push("");

  lines.push("## Candidate trade match rates");
  lines.push("");
  lines.push(
    "`text` = free-text vocabulary over description + scope + category (what the" +
      " pipeline filters on today). `category` = rows whose persisted" +
      " `development_type` matched a candidate enum string, as a share of rows that" +
      " have any category.",
  );
  lines.push("");
  lines.push("| trade | text match | text rate | category match | category rate (of persisted) |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const r of tradeRates) {
    lines.push(
      `| ${escapeCell(r.label)} | ${r.textMatched} | ${pct(r.textRate)} | ${r.categoryMatched} | ${pct(r.categoryRateOfPersisted)} |`,
    );
  }
  lines.push("");
  lines.push(
    "**Read this as:** a high `text rate` with a low `category rate` means the trade is" +
      " visible in the free text but NOT cleanly category-filterable — it needs a" +
      " vocabulary pack (roofing's situation). A high `category rate` confirms the" +
      " cheaper enum filter the trade-pick is betting on.",
  );
  lines.push("");
  return lines.join("\n");
}

/** Escape the pipe + newline chars that would break a Markdown table cell. */
function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
