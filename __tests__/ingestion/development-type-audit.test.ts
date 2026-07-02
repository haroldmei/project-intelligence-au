// Unit tests for the development-type audit's pure classification/count logic
// (issue #26). Fixtures only — no live DB, so this runs in the backend gate
// without the docker Postgres. The Prisma read + file write live in
// scripts/audit-development-types.ts and are covered by the integration suite.
import { describe, it, expect } from "vitest";
import {
  auditDevelopmentTypes,
  candidateFilters,
  countDevelopmentTypes,
  NONE_LABEL,
  persistedCategoryCount,
  renderReport,
  tradeMatchRate,
  type AuditRow,
} from "@/modules/ingestion/development-type-audit";

/** A small hand-built row set exercising each branch. */
const ROWS: AuditRow[] = [
  {
    developmentType: "Demolition",
    description: "Demolition only — removal of existing dwelling",
    rawScopeText: "Full demolition. Site to be left clear.",
  },
  {
    developmentType: "Demolition-Only",
    description: "Partial demolition of rear structures",
    rawScopeText: null,
  },
  {
    developmentType: "Swimming Pool",
    description: "Construction of an in-ground swimming pool and spa",
    rawScopeText: "Pool fence to AS1926",
  },
  {
    developmentType: "Subdivision of Land",
    description: "Torrens title subdivision into 3 lots with bulk earthworks",
    rawScopeText: null,
  },
  {
    // No persisted category — the pre-#26 state; roofing has no clean category.
    developmentType: null,
    description: "Re-roof existing dwelling with Colorbond metal roof",
    rawScopeText: "Replace tile roof; new gutters and downpipes",
  },
  {
    developmentType: "",
    description: "Alterations and additions to residential development",
    rawScopeText: null,
  },
];

describe("countDevelopmentTypes", () => {
  it("collapses null and blank into a single NONE bucket", () => {
    const counts = countDevelopmentTypes(ROWS);
    const none = counts.find((c) => c.value === NONE_LABEL);
    expect(none?.count).toBe(2); // the null row + the "" row
  });

  it("counts each distinct persisted value once", () => {
    const counts = countDevelopmentTypes(ROWS);
    expect(counts.find((c) => c.value === "Demolition")?.count).toBe(1);
    expect(counts.find((c) => c.value === "Swimming Pool")?.count).toBe(1);
  });

  it("sorts by count desc then value asc for a stable report", () => {
    const rows: AuditRow[] = [
      { developmentType: "B", description: "", rawScopeText: null },
      { developmentType: "A", description: "", rawScopeText: null },
      { developmentType: "A", description: "", rawScopeText: null },
    ];
    const counts = countDevelopmentTypes(rows);
    expect(counts.map((c) => c.value)).toEqual(["A", "B"]);
  });

  it("returns an empty list for no rows", () => {
    expect(countDevelopmentTypes([])).toEqual([]);
  });
});

describe("persistedCategoryCount", () => {
  it("counts only rows with a non-blank development_type", () => {
    expect(persistedCategoryCount(ROWS)).toBe(4); // 6 rows, 2 are null/blank
  });
});

describe("tradeMatchRate", () => {
  it("matches demolition via both free text and the persisted category", () => {
    const demo = candidateFilters().find((f) => f.label === "demolition")!;
    const rate = tradeMatchRate(ROWS, demo);
    // Two demolition rows match on text; both also carry a demolition category.
    expect(rate.textMatched).toBe(2);
    expect(rate.categoryMatched).toBe(2);
    // category rate is out of the 4 rows that have any persisted category.
    expect(rate.categoryRateOfPersisted).toBeCloseTo(2 / 4);
  });

  it("matches roofing on free text but NOT on any category (its known gap)", () => {
    const roofing = candidateFilters().find((f) => f.label.startsWith("roofing"))!;
    const rate = tradeMatchRate(ROWS, roofing);
    expect(rate.textMatched).toBeGreaterThan(0); // "re-roof", "colorbond", "dwelling"…
    expect(rate.categoryMatched).toBe(0); // roofing has no development-type filter
  });

  it("matches the swimming pool row on text and category", () => {
    const pool = candidateFilters().find((f) => f.label === "swimming pool")!;
    const rate = tradeMatchRate(ROWS, pool);
    expect(rate.textMatched).toBe(1);
    expect(rate.categoryMatched).toBe(1);
  });

  it("matches subdivision/earthworks on text and category", () => {
    const sub = candidateFilters().find((f) => f.label.startsWith("subdivision"))!;
    const rate = tradeMatchRate(ROWS, sub);
    expect(rate.textMatched).toBe(1);
    expect(rate.categoryMatched).toBe(1);
  });

  it("reports zero rates over an empty row set without dividing by zero", () => {
    const demo = candidateFilters().find((f) => f.label === "demolition")!;
    const rate = tradeMatchRate([], demo);
    expect(rate.textRate).toBe(0);
    expect(rate.categoryRateOfPersisted).toBe(0);
  });
});

describe("candidateFilters", () => {
  it("covers roofing baseline + the three Wave-1 candidate trades", () => {
    const labels = candidateFilters().map((f) => f.label);
    expect(labels.some((l) => l.startsWith("roofing"))).toBe(true);
    expect(labels).toContain("demolition");
    expect(labels).toContain("swimming pool");
    expect(labels.some((l) => l.startsWith("subdivision"))).toBe(true);
  });

  it("reuses the registered demolition pack's development-type filters", () => {
    const demo = candidateFilters().find((f) => f.label === "demolition")!;
    // These come from the demolition vertical pack (docs/25), not a fork.
    expect(demo.categoryCandidates).toContain("demolition");
  });
});

describe("auditDevelopmentTypes + renderReport", () => {
  const report = auditDevelopmentTypes(ROWS, "2026-07-03");

  it("summarises totals and coverage", () => {
    expect(report.totalRows).toBe(6);
    expect(report.persistedCategories).toBe(4);
    expect(report.runDate).toBe("2026-07-03");
  });

  it("renders a Markdown report with the provenance header and run date", () => {
    const md = renderReport(report, "scripts/audit-development-types.ts");
    expect(md).toContain("Generated by `scripts/audit-development-types.ts` on 2026-07-03");
    expect(md).toContain("Distinct `development_type` values");
    expect(md).toContain("Candidate trade match rates");
    // Every candidate trade shows up as a table row.
    expect(md).toContain("demolition");
    expect(md).toContain("swimming pool");
  });

  it("flags the zero-coverage warning when no row has a category", () => {
    const noCats: AuditRow[] = [
      { developmentType: null, description: "re-roof", rawScopeText: null },
    ];
    const md = renderReport(auditDevelopmentTypes(noCats, "2026-07-03"), "x");
    expect(md).toContain("No rows carry a development-type category yet");
  });

  it("escapes pipe characters so table cells stay valid Markdown", () => {
    const piped: AuditRow[] = [
      { developmentType: "Mixed | Use", description: "", rawScopeText: null },
    ];
    const md = renderReport(auditDevelopmentTypes(piped, "2026-07-03"), "x");
    expect(md).toContain("Mixed \\| Use");
  });
});
