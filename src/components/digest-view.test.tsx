// DigestView empty-state messaging (issue #215 — saved-query editor removed in V1).
// The empty-digest branch must NOT link to the deleted /account/saved-query page,
// and must explain the V1 immutable-query contract instead of saying "refine your
// query". The service-area link and the card-rendering path remain unchanged.
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DigestView } from "./digest-view";
import type { DigestDetail } from "@/modules/portal/loaders";

const BASE_DIGEST: DigestDetail = {
  id: "dg_test",
  sentAt: "2026-07-08T00:00:00Z",
  runDate: "2026-07-08T00:00:00Z",
  daCount: 0,
  emailStatus: "sent",
  smsStatus: null,
  fallbackUsed: false,
  leadClassCounts: { fast_track: 0, strata_heritage: 0, builder_pipeline: 0 },
  areaLabel: "Inner West",
  cards: [],
};

describe("DigestView — empty-state messaging (issue #215)", () => {
  it("does NOT link to the deleted /account/saved-query page", () => {
    render(
      <DigestView digest={BASE_DIGEST} areaLabel="Inner West" weeksOfHistory={1} />,
    );

    // The old href="/account/saved-query" must be absent — no stale 404 link.
    expect(screen.queryByRole("link", { name: /search query/i })).toBeNull();
    expect(
      screen.queryByText(/refine your search/i),
    ).toBeNull();
  });

  it("explains the query is immutable in V1 instead of suggesting refinement", () => {
    render(
      <DigestView digest={BASE_DIGEST} areaLabel="Inner West" weeksOfHistory={1} />,
    );

    // The message should describe the V1 immutable-query contract rather than
    // offering to "refine your search query".
    expect(
      screen.getByText(/cannot be edited in V1/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/seeded at signup/i),
    ).toBeTruthy();
  });

  it("still links to the /account/area page for service-area expansion", () => {
    render(
      <DigestView digest={BASE_DIGEST} areaLabel="Inner West" weeksOfHistory={1} />,
    );

    const areaLink = screen.getByRole("link", { name: /service area/i });
    expect(areaLink).toBeTruthy();
    expect(areaLink).toHaveAttribute("href", "/account/area");
  });
});

describe("DigestView — card rendering", () => {
  const digestWithCards: DigestDetail = {
    ...BASE_DIGEST,
    daCount: 1,
    cards: [
      {
        daId: "da_1",
        rank: 1,
        relevanceScore: 85,
        whyMatched: "Close to your area",
        address: "1 Test St, Sydney",
        council: "Inner West",
        leadClass: "builder_pipeline",
        constructionCertifiedAt: null,
        estimatedValue: 500000,
        portalUrl: "https://portal.example.com/da_1",
        applicantName: "Test Applicant",
        description: "Construction of a new dwelling",
        lodgementDate: "2026-06-01",
        userFeedback: null,
      },
    ],
  };

  it("renders cards when there are matching leads", () => {
    render(
      <DigestView
        digest={digestWithCards}
        areaLabel="Inner West"
        weeksOfHistory={1}
      />,
    );

    // The address from the card should be visible.
    expect(screen.getByText("1 Test St, Sydney")).toBeTruthy();
    // The empty-state message should NOT be shown.
    expect(
      screen.queryByText(/cannot be edited in V1/i),
    ).toBeNull();
  });
});
