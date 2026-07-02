// Weekly-digest email — lead-class badges + grouping (issue #14).
// The template is a pure string builder (no DB, no env), so it runs in the
// always-on fe suite. Proves all three badges render, the groups are ordered
// fast_track → strata_heritage → builder_pipeline, and rank order is preserved
// within each group even when the input cards are interleaved.
import { describe, it, expect } from "vitest";
import { WeeklyDigestTemplate } from "@/emails/weekly-digest";
import type { LeadClass } from "@/modules/relevance/lead-class";

function card(id: string, leadClass: LeadClass, address: string, score: number) {
  return {
    id,
    address,
    lga: "Inner West",
    value: "AUD 150k",
    why: "Roofing scope match",
    scope: "Roof works.",
    applicant: "Acme",
    relevanceScore: score,
    leadClass,
    portalUrl: `https://council.nsw.gov.au/da/${id}`,
    thumbUpUrl: `https://pi-au.example.com/api/feedback?id=${id}&v=1&token=abc`,
    thumbDownUrl: `https://pi-au.example.com/api/feedback?id=${id}&v=0&token=abc`,
  };
}

function renderAllThreeClasses() {
  return WeeklyDigestTemplate({
    weekStart: "27 Apr 2026",
    leadCount: 4,
    lgas: ["Inner West"],
    // Deliberately out of group order + interleaved ranks.
    cards: [
      card("bp-1", "builder_pipeline", "1 Pipeline St", 9),
      card("ft-1", "fast_track", "2 Fast Rd", 8),
      card("sh-1", "strata_heritage", "3 Heritage Ln", 7),
      card("ft-2", "fast_track", "4 Fast Cres", 6),
    ],
    smsEnabled: false,
  });
}

describe("WeeklyDigestTemplate — lead classes (issue #14)", () => {
  const { html } = renderAllThreeClasses();

  it("renders all three lead-class badge labels", () => {
    expect(html).toContain("Fast-track");
    expect(html).toContain("Strata &amp; heritage");
    expect(html).toContain("Builder pipeline");
  });

  it("orders groups fast_track → strata_heritage → builder_pipeline", () => {
    const idxFast = html.indexOf("Fast-track");
    const idxStrata = html.indexOf("Strata &amp; heritage");
    const idxBuilder = html.indexOf("Builder pipeline");
    expect(idxFast).toBeLessThan(idxStrata);
    expect(idxStrata).toBeLessThan(idxBuilder);
  });

  it("preserves rank order within a group (ft-1 before ft-2)", () => {
    expect(html.indexOf("2 Fast Rd")).toBeLessThan(html.indexOf("4 Fast Cres"));
  });

  it("regroups the interleaved builder card to the end", () => {
    expect(html.indexOf("1 Pipeline St")).toBeGreaterThan(html.indexOf("3 Heritage Ln"));
  });

  it("defaults a card with no leadClass to the builder pipeline", () => {
    const { html: h } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 1,
      lgas: ["Inner West"],
      // leadClass intentionally omitted — must not throw, must render a badge.
      cards: [
        {
          id: "x1",
          address: "9 Nowhere St",
          lga: "Inner West",
          why: "y",
          scope: "s",
          applicant: "",
          relevanceScore: 5,
          portalUrl: "https://council.nsw.gov.au/da/x1",
          thumbUpUrl: "https://pi-au.example.com/api/feedback?id=x1&v=1&token=abc",
          thumbDownUrl: "https://pi-au.example.com/api/feedback?id=x1&v=0&token=abc",
        },
      ],
      smsEnabled: false,
    });
    expect(h).toContain("Builder pipeline");
    expect(h).not.toContain("Fast-track");
  });
});
