// Unit tests for the DA Exhibitions HTML parsers.
// Fixtures are real Portal pages captured 2026-04-30:
//   - Cumberland On Exhibition listing (page 0)
//   - One detail page from that listing (Merrylands dual occupancy)
// If these break in CI, the Portal redesigned its markup and the parser
// needs an update — see docs/22-pipeline-enable.md.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDaexListing,
  parseDaexDetail,
  parseSsdListing,
  parseSsdDetail,
} from "@/modules/ingestion/sources";

const FIXTURES = join(__dirname, "fixtures");

describe("parseDaexListing", () => {
  const html = readFileSync(join(FIXTURES, "daex-cumberland-on-exhibition-page0.html"), "utf-8");
  const rows = parseDaexListing(html);

  it("finds at least one card on a populated listing page", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("each row has a non-empty title", () => {
    for (const r of rows) {
      expect(r.title, JSON.stringify(r)).not.toBeNull();
      expect((r.title ?? "").length).toBeGreaterThan(5);
    }
  });

  it("each row has a PAN or DA number", () => {
    for (const r of rows) {
      expect(r.panNumber ?? r.daNumber, JSON.stringify(r)).not.toBeNull();
    }
  });

  it("PAN numbers match the PAN-NNNNNN shape", () => {
    const withPan = rows.filter((r) => r.panNumber);
    expect(withPan.length).toBeGreaterThan(0);
    for (const r of withPan) {
      expect(r.panNumber).toMatch(/^PAN-\d+$/);
    }
  });

  it("each row has a /daex/exhibition/ detail link", () => {
    for (const r of rows) {
      expect(r.detailHref, JSON.stringify(r)).toMatch(/^\/daex\/exhibition\//);
    }
  });

  it("status comes back as 'On Exhibition' when filtered by that status", () => {
    for (const r of rows) {
      // Either the status field or the tag fallback should expose it.
      expect((r.status ?? "").toLowerCase()).toContain("on exhibition");
    }
  });

  it("council label is populated (Cumberland for this fixture)", () => {
    for (const r of rows) {
      expect((r.council ?? "").toLowerCase()).toContain("cumberland");
    }
  });
});

describe("parseDaexDetail", () => {
  const html = readFileSync(join(FIXTURES, "daex-detail-cumberland-merrylands.html"), "utf-8");
  const detail = parseDaexDetail(html);

  it("extracts the property address", () => {
    expect(detail.propertyAddress).toBeTruthy();
    expect(detail.propertyAddress!.toLowerCase()).toContain("merrylands");
  });

  it("extracts the development-type free-text scope", () => {
    expect(detail.developmentTypeText).toBeTruthy();
    // Sample fixture is a Residential Accommodation / Dwelling House DA.
    expect(detail.developmentTypeText!.toLowerCase()).toMatch(/residential|dwelling/);
  });

  it("parses the AU dd/mm/yyyy exhibition window into ISO dates", () => {
    expect(detail.exhibitionStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(detail.exhibitionEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(detail.exhibitionStart! < detail.exhibitionEnd!).toBe(true);
  });

  it("captures the consent authority", () => {
    expect(detail.consentAuthority).toBeTruthy();
  });

  it("returns null decision on an On Exhibition detail page (no Decision field)", () => {
    // The fixture is an On Exhibition DA — no decision was made yet.
    expect(detail.decision).toBeNull();
  });
});

describe("parseDaexDetail — Determined approved", () => {
  const html = readFileSync(
    join(FIXTURES, "daex-detail-cumberland-determined-approved.html"),
    "utf-8",
  );
  const detail = parseDaexDetail(html);

  it("extracts the decision field as 'Approved'", () => {
    expect(detail.decision).toBe("Approved");
  });
});

describe("parseDaexDetail — project description", () => {
  // West Pymble fixture has both 'Type of development' (categorical) and
  // 'field-field-project-description' (the actual scope blob). We want the
  // free-text scope, not just the category.
  const html = readFileSync(join(FIXTURES, "daex-detail-koo.html"), "utf-8");
  const detail = parseDaexDetail(html);

  it("extracts the free-text project description", () => {
    expect(detail.projectDescription).toBeTruthy();
    expect(detail.projectDescription!.toLowerCase()).toContain("alterations");
    expect(detail.projectDescription!.toLowerCase()).toContain("dwelling");
  });

  it("captures the categorical Type of development separately", () => {
    expect(detail.developmentTypeText).toBeTruthy();
    expect(detail.developmentTypeText!.toLowerCase()).toContain("residential");
  });

  it("the two fields are distinct (project description is richer)", () => {
    expect(detail.projectDescription).not.toBe(detail.developmentTypeText);
  });
});

// ─── State Significant Development register ─────────────────────────────────

describe("parseSsdListing", () => {
  const html = readFileSync(join(FIXTURES, "ssd-listing-page0.html"), "utf-8");
  const rows = parseSsdListing(html);

  it("finds at least 9 SSD cards on a populated listing page", () => {
    expect(rows.length).toBeGreaterThanOrEqual(9);
  });

  it("extracts SSD-NNNNNNNN case ids", () => {
    for (const r of rows) {
      expect(r.caseId, JSON.stringify(r)).toMatch(/^SSD-/);
    }
  });

  it("extracts case_type as 'State Significant Development'", () => {
    const ssd = rows.filter((r) => r.caseType === "State Significant Development");
    expect(ssd.length).toBeGreaterThan(0);
  });

  it("each row has a /major-projects/projects/<slug> detail link", () => {
    for (const r of rows) {
      expect(r.detailHref).toMatch(/^\/major-projects\/projects\//);
    }
  });

  it("each row has a project title", () => {
    for (const r of rows) {
      expect((r.title ?? "").length).toBeGreaterThan(3);
    }
  });
});

describe("parseSsdDetail", () => {
  const html = readFileSync(join(FIXTURES, "ssd-detail-castlecrag.html"), "utf-8");
  const detail = parseSsdDetail(html);

  it("extracts the SSD application number", () => {
    expect(detail.applicationNumber).toMatch(/^SSD-/);
  });

  it("extracts assessment type and development type", () => {
    expect(detail.assessmentType).toContain("Significant");
    expect(detail.developmentType).toBeTruthy();
  });

  it("parses Exhibition Start-End Date as ISO dates", () => {
    expect(detail.exhibitionStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(detail.exhibitionEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("captures the contact planner name + phone (SSD-only fields)", () => {
    expect(detail.contactPlannerName).toBeTruthy();
    expect(detail.contactPlannerPhone).toBeTruthy();
  });

  it("captures at least one LGA", () => {
    expect(detail.lgaList.length).toBeGreaterThan(0);
  });
});
