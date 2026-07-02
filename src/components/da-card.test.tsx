import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DACard } from "./da-card";

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
) as unknown as typeof fetch;

const PROPS = {
  daId: "test-da-1",
  address: "12 Acacia Ave, Penrith NSW 2750",
  lga: "Western Sydney",
  relevanceScore: 8,
  estimatedValue: 180000,
  whyMatched: "Existing dwelling re-roof, Colorbond replacement",
  scopeText: "Demolition of existing tiled roof and installation of Colorbond metal deck roofing system.",
  applicantName: "Smith & Partners Architects",
  portalUrl: "https://example.com/da/123",
};

describe("DACard", () => {
  it("renders the address", () => {
    render(<DACard {...PROPS} />);
    expect(screen.getByText("12 Acacia Ave, Penrith NSW 2750")).toBeTruthy();
  });

  it("renders the LGA badge", () => {
    render(<DACard {...PROPS} />);
    expect(screen.getByText("Western Sydney")).toBeTruthy();
  });

  it("renders the value", () => {
    render(<DACard {...PROPS} />);
    expect(screen.getByText(/AUD 180,000/i)).toBeTruthy();
  });

  // Future-proofs records from feeds with no cost-of-work $ field — e.g. the
  // PlanSA (SA) jurisdiction adapter, and NSW records that lack a value. The
  // card must render cleanly with no dollar amount, never a broken/empty chip.
  it("renders without a value when estimatedValue is null", () => {
    render(<DACard {...PROPS} estimatedValue={null} />);
    expect(screen.getByText(/value not disclosed/i)).toBeTruthy();
    expect(screen.queryByText(/AUD/i)).toBeNull();
    // Core content still renders.
    expect(screen.getByText(PROPS.address)).toBeTruthy();
  });

  it("renders without a value when estimatedValue is undefined", () => {
    const { estimatedValue: _omit, ...noValue } = PROPS;
    render(<DACard {...noValue} />);
    expect(screen.getByText(/value not disclosed/i)).toBeTruthy();
    expect(screen.queryByText(/AUD/i)).toBeNull();
  });

  it("renders the whyMatched text", () => {
    render(<DACard {...PROPS} />);
    expect(screen.getByText(/Colorbond replacement/i)).toBeTruthy();
  });

  it("renders thumb up and thumb down buttons with accessible labels", () => {
    render(<DACard {...PROPS} />);
    expect(screen.getByRole("button", { name: /thumb up for/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /thumb down for/i })).toBeTruthy();
  });

  it("renders a link to the portal URL", () => {
    render(<DACard {...PROPS} />);
    const link = screen.getByRole("link", { name: /view da application for/i });
    expect(link.getAttribute("href")).toBe("https://example.com/da/123");
  });

  it("optimistically updates feedback on thumb up click", async () => {
    render(<DACard {...PROPS} />);
    const thumbUp = screen.getByRole("button", { name: /thumb up for/i });
    expect(thumbUp.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(thumbUp);
    expect(thumbUp.getAttribute("aria-pressed")).toBe("true");
  });
});
