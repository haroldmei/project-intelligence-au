// Unit tests for the DA Exhibitions HTML parsers.
// Fixtures are real Portal pages captured 2026-04-30:
//   - Cumberland On Exhibition listing (page 0)
//   - One detail page from that listing (Merrylands dual occupancy)
// If these break in CI, the Portal redesigned its markup and the parser
// needs an update — see docs/22-pipeline-enable.md.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDaexListing, parseDaexDetail } from "@/modules/ingestion/sources";

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
});
