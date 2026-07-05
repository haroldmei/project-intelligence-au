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

  it("renders the CC 'work starting' badge when constructionCertifiedAt is set (issue #13)", () => {
    const { html: h } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 1,
      lgas: ["Inner West"],
      cards: [{ ...card("cc-1", "fast_track", "9 Cert St", 9), constructionCertifiedAt: "2026-06-15" }],
      smsEnabled: false,
    });
    expect(h).toContain("CC issued 15 Jun 2026 — work starting");
  });

  it("omits the CC badge when constructionCertifiedAt is absent", () => {
    expect(html).not.toContain("work starting");
  });

  it("renders the quiet-week reassurance with the DAs-checked count (issue #58)", () => {
    const { subject, html: h } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 0,
      lgas: ["Inner West", "Eastern Suburbs"],
      cards: [],
      dasChecked: 143,
      smsEnabled: false,
    });
    expect(h).toContain("No strong re-roof leads this week");
    expect(h).toContain("We checked 143 DAs across your Inner West + Eastern Suburbs");
    // The empty card table and the "0 leads" strings must NOT appear.
    expect(h).not.toContain("0 leads");
    expect(h).not.toContain("End of digest ·");
    // Subject reassures rather than advertising "0 leads".
    expect(subject).toContain("143 DAs");
    expect(subject).not.toContain("0 leads");
  });

  it("singularises the DA word when exactly one DA was checked (issue #58)", () => {
    const { html: h } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 0,
      lgas: ["Inner West"],
      cards: [],
      dasChecked: 1,
      smsEnabled: false,
    });
    expect(h).toContain("We checked 1 DA across your Inner West");
    expect(h).not.toContain("1 DAs");
  });

  it("falls back to 0 when dasChecked is omitted on a quiet week (issue #58)", () => {
    const { html: h } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 0,
      lgas: ["Inner West"],
      cards: [],
      smsEnabled: false,
    });
    expect(h).toContain("No strong re-roof leads this week");
    expect(h).toContain("We checked 0 DAs across your Inner West");
  });

  it("keeps the normal card layout when leads exist (no quiet-week branch)", () => {
    expect(html).not.toContain("No strong re-roof leads this week");
    expect(html).toContain("End of digest · 4 leads");
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

describe("WeeklyDigestTemplate — rated-lead recap (CF-1.7, issue #51; #186)", () => {
  it("renders the honest 'N of M rated on-target' block when ratedLeadRecap is passed", () => {
    const { html } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 4,
      lgas: ["Inner West"],
      cards: [card("ft-1", "fast_track", "2 Fast Rd", 8)],
      ratedLeadRecap: { onTarget: 14, rated: 15, rate: 93, weeks: 4 },
      smsEnabled: false,
    });
    expect(html).toContain(
      "✓ Last 4 weeks: you marked 14 of 15 rated leads on-target (93%)",
    );
    // Never the misleading "precision" label (issue #186) — this measures the
    // user's own thumbs, not FR-013 ground-truth precision.
    expect(html).not.toContain("precision");
    // Proof stat sits above the DA cards (design pillar P4).
    expect(html.indexOf("rated leads on-target")).toBeLessThan(html.indexOf("2 Fast Rd"));
  });

  it("omits the recap block entirely when ratedLeadRecap is absent", () => {
    const { html } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 1,
      lgas: ["Inner West"],
      cards: [card("ft-1", "fast_track", "2 Fast Rd", 8)],
      smsEnabled: false,
    });
    expect(html).not.toContain("rated leads on-target");
  });

  it("still shows the recap proof on a quiet (no-lead) week", () => {
    const { html } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 0,
      lgas: ["Inner West"],
      cards: [],
      dasChecked: 12,
      ratedLeadRecap: { onTarget: 7, rated: 8, rate: 88, weeks: 4 },
      smsEnabled: false,
    });
    expect(html).toContain(
      "✓ Last 4 weeks: you marked 7 of 8 rated leads on-target (88%)",
    );
    expect(html).toContain("No strong re-roof leads this week");
  });

  it("shows the <4-week onboarding fallback when no recap stat is available yet", () => {
    // A user before week 4 (or one who's rated nothing) gets no badge — instead
    // the email nudges the thumbs behaviour that will populate the stat, mirroring
    // the portal header so both surfaces stay in lockstep (CF-1.7 acceptance).
    const { html } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 3,
      lgas: ["Inner West"],
      cards: [card("ft-1", "fast_track", "2 Fast Rd", 8)],
      smsEnabled: false,
    });
    expect(html).toContain("Your lead recap unlocks after 4 weeks");
    expect(html).not.toContain("rated leads on-target");
  });

  it("does not show the onboarding fallback once the recap badge is present", () => {
    const { html } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 3,
      lgas: ["Inner West"],
      cards: [card("ft-1", "fast_track", "2 Fast Rd", 8)],
      ratedLeadRecap: { onTarget: 14, rated: 15, rate: 93, weeks: 4 },
      smsEnabled: false,
    });
    expect(html).not.toContain("unlock after 4 weeks");
  });

  it("does not nag with the onboarding fallback on a quiet (no-lead) week", () => {
    const { html } = WeeklyDigestTemplate({
      weekStart: "27 Apr 2026",
      leadCount: 0,
      lgas: ["Inner West"],
      cards: [],
      dasChecked: 9,
      smsEnabled: false,
    });
    expect(html).not.toContain("unlock after 4 weeks");
    expect(html).toContain("No strong re-roof leads this week");
  });
});

describe("WeeklyDigestTemplate — degraded-ranking note (system-design §7.3, issue #181)", () => {
  const base = {
    weekStart: "27 Apr 2026",
    leadCount: 3,
    lgas: ["Inner West"],
    cards: [card("bp-1", "builder_pipeline" as LeadClass, "1 Pipeline St", 8)],
    smsEnabled: false,
  };

  it("shows the 'basic mode' outage note when the LLM was unavailable", () => {
    const { html } = WeeklyDigestTemplate({
      ...base,
      fallbackUsed: true,
      fallbackReason: "llm_unavailable",
    });
    expect(html).toContain("Relevance ranking ran in basic mode this week");
    expect(html).toContain("briefly unavailable");
    // Must NOT read as a cost/billing throttle — that would misinform the user.
    expect(html).not.toContain("AI cost cap reached");
  });

  it("shows the cost-cap note when the weekly ceiling was hit", () => {
    const { html } = WeeklyDigestTemplate({
      ...base,
      fallbackUsed: true,
      fallbackReason: "cost_cap",
    });
    expect(html).toContain("AI cost cap reached");
    expect(html).not.toContain("basic mode");
  });

  it("defaults to the cost-cap copy when fallbackUsed but no reason given (back-compat)", () => {
    const { html } = WeeklyDigestTemplate({ ...base, fallbackUsed: true });
    expect(html).toContain("AI cost cap reached");
  });

  it("shows no degraded-ranking note on the normal full-pipeline path", () => {
    const { html } = WeeklyDigestTemplate(base);
    expect(html).not.toContain("basic mode");
    expect(html).not.toContain("AI cost cap reached");
  });
});

describe("WeeklyDigestTemplate — personalisation-on note (issue #96 A3)", () => {
  const base = {
    weekStart: "27 Apr 2026",
    leadCount: 1,
    lgas: ["Inner West"],
    cards: [card("bp-1", "builder_pipeline" as LeadClass, "1 Pipeline St", 8)],
    smsEnabled: false,
  };

  it("renders the one-time note when personalisationActivated is true", () => {
    const { html } = WeeklyDigestTemplate({ ...base, personalisationActivated: true });
    expect(html).toContain("Your digest is now personalised");
  });

  it("omits the note by default", () => {
    const { html } = WeeklyDigestTemplate(base);
    expect(html).not.toContain("Your digest is now personalised");
  });
});
