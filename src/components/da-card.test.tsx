import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DACard } from "./da-card";

// captureClient is consent-gated internally; mock it so the test asserts the
// call the component makes without needing a real posthog-js init.
const { captureClientMock } = vi.hoisted(() => ({ captureClientMock: vi.fn() }));
vi.mock("@/lib/analytics/browser", () => ({ captureClient: captureClientMock }));

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
) as unknown as typeof fetch;

beforeEach(() => {
  captureClientMock.mockClear();
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
  );
});

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

  // Issue #13: a fixture CC linked to a fixture DA (represented by the
  // constructionCertifiedAt prop the PCC linkage stamps) renders the
  // "CC issued — work starting" badge with the date.
  it("renders the CC 'work starting' badge when constructionCertifiedAt is present", () => {
    render(<DACard {...PROPS} constructionCertifiedAt="2026-06-15" />);
    const badge = screen.getByText(/CC issued 15 Jun 2026 — work starting/i);
    expect(badge).toBeTruthy();
  });

  it("does not render the CC badge when constructionCertifiedAt is absent", () => {
    render(<DACard {...PROPS} />);
    expect(screen.queryByText(/work starting/i)).toBeNull();
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

  // Issue #59: a failed feedback POST must surface a *visible* error, not only
  // an sr-only announcement. Mock a rejected fetch and assert a visible
  // role="alert" affordance appears and the thumb reverts to neutral.
  it("shows a visible error alert when the feedback POST rejects", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down")
    );
    render(<DACard {...PROPS} />);
    const thumbUp = screen.getByRole("button", { name: /thumb up for/i });
    fireEvent.click(thumbUp);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/tap again to retry/i);
    // The alert is a real visible element, not an sr-only-only region.
    expect(alert.className).not.toMatch(/sr-only/);
    // Optimistic thumb reverted to neutral after the failure.
    await waitFor(() =>
      expect(thumbUp.getAttribute("aria-pressed")).toBe("false")
    );
  });

  // A non-OK HTTP response (fetch does not reject on 4xx/5xx) must also be
  // treated as a failure and surface the visible error.
  it("shows a visible error alert when the feedback POST returns a non-OK status", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ ok: false }),
    });
    render(<DACard {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /thumb down for/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/tap again to retry/i);
  });

  it("clears the error alert when a subsequent feedback POST succeeds", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down")
    );
    render(<DACard {...PROPS} />);
    const thumbUp = screen.getByRole("button", { name: /thumb up for/i });
    fireEvent.click(thumbUp);
    await screen.findByRole("alert");

    // Retry — fetch now succeeds (default mock), error should clear.
    fireEvent.click(thumbUp);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  // FR-031 da_card_clicked: clicking through to the council portal is the core
  // wedge signal (which leads a tradie actually pursues).
  it("captures da_card_clicked when the View DA link is clicked", () => {
    render(<DACard {...PROPS} />);
    fireEvent.click(screen.getByRole("link", { name: /view da application/i }));
    expect(captureClientMock).toHaveBeenCalledWith("da_card_clicked", { source: "portal" });
  });

  it("does not capture da_card_clicked on render or on a thumb vote", () => {
    render(<DACard {...PROPS} />);
    expect(captureClientMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /thumb up for/i }));
    expect(captureClientMock).not.toHaveBeenCalled();
  });
});
