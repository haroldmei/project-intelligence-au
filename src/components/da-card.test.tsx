import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  // Issue #54: a card thumbed in a previous session (loaded via feedbackMap →
  // initialFeedback) must NOT render the 'Feedback saved / Undo' toast on mount.
  // The old code derived toast visibility from `undoQueue !== feedback`, which was
  // true the instant an already-thumbed card rendered — and its Undo wrote
  // feedback:'remove', silently destroying the tradie's saved thumb.
  it("does not render the undo toast on mount when initialFeedback is set", () => {
    render(<DACard {...PROPS} initialFeedback="up" />);
    // The thumb reflects the saved state...
    expect(
      screen.getByRole("button", { name: /thumb up for/i }).getAttribute("aria-pressed")
    ).toBe("true");
    // ...but no spurious 'Feedback saved' toast / Undo affordance appears.
    expect(screen.queryByText("Feedback saved")).toBeNull();
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  it("does not render the undo toast on mount when initialFeedback is down", () => {
    render(<DACard {...PROPS} initialFeedback="down" />);
    expect(screen.queryByText("Feedback saved")).toBeNull();
  });

  it("shows the undo toast only after a thumb interaction", () => {
    render(<DACard {...PROPS} initialFeedback={null} />);
    expect(screen.queryByText("Feedback saved")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /thumb up for/i }));
    expect(screen.getByText("Feedback saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: /undo/i })).toBeTruthy();
  });

  // Undo must restore the prior feedback, not blow it away. Thumb up on a
  // previously-neutral card, then Undo → back to neutral.
  it("undo restores the pre-interaction feedback state", async () => {
    render(<DACard {...PROPS} initialFeedback={null} />);
    const thumbUp = screen.getByRole("button", { name: /thumb up for/i });
    fireEvent.click(thumbUp);
    expect(thumbUp.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(thumbUp.getAttribute("aria-pressed")).toBe("false");
    // Toast dismisses on undo.
    expect(screen.queryByText("Feedback saved")).toBeNull();
  });

  // Issue #222: handleUndo must have the same resilience as handleThumb — a
  // failed undo POST must revert the card state and surface a visible error so
  // the displayed thumb never silently diverges from what the server holds.
  it("reverts feedback and shows a visible error when the undo POST rejects", async () => {
    render(<DACard {...PROPS} />);
    const thumbUp = screen.getByRole("button", { name: /thumb up for/i });

    // Thumb up to create an undo-able action. Default mock succeeds.
    fireEvent.click(thumbUp);
    expect(thumbUp.getAttribute("aria-pressed")).toBe("true");

    // Wait for the undo toast to appear
    expect(screen.getByText("Feedback saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: /undo/i })).toBeTruthy();

    // Stub the undo POST to reject
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down")
    );

    // Click Undo
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    // Assert: feedback reverts to its pre-undo value (thumb still pressed)
    await waitFor(() =>
      expect(thumbUp.getAttribute("aria-pressed")).toBe("true")
    );

    // Assert: visible error shown
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/tap again to retry/i);
    expect(alert.className).not.toMatch(/sr-only/);
  });

  it("reverts feedback and shows a visible error when the undo POST returns a non-OK status", async () => {
    render(<DACard {...PROPS} />);
    const thumbUp = screen.getByRole("button", { name: /thumb up for/i });

    // Thumb up to create undo-able state
    fireEvent.click(thumbUp);
    expect(screen.getByText("Feedback saved")).toBeTruthy();

    // Stub undo POST to return 500
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ ok: false }),
    });

    // Click Undo
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    // Assert: feedback reverted, error shown
    await waitFor(() =>
      expect(thumbUp.getAttribute("aria-pressed")).toBe("true")
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/tap again to retry/i);
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

  // Issue #249: a stale undo-toast setTimeout from the first tap must not cut
  // the second tap's undo window short. Each thumb action gets the full 5s.
  it("gives a full 5s undo window from the second tap on rapid successive thumbs", async () => {
    vi.useFakeTimers();
    render(<DACard {...PROPS} />);
    const thumbUp = screen.getByRole("button", { name: /thumb up for/i });
    const thumbDown = screen.getByRole("button", { name: /thumb down for/i });

    // First thumb at t=0 → toast appears. Use advanceTimersByTimeAsync to
    // process microtasks (promise resolution inside startTransition) so
    // isPending becomes false and buttons are re-enabled.
    fireEvent.click(thumbUp);
    await vi.advanceTimersByTimeAsync(1);
    expect(screen.getByText("Feedback saved")).toBeTruthy();

    // Advance 3s (well within the 5s window)
    act(() => vi.advanceTimersByTime(3000));

    // Second (different) thumb at t=3s → toast re-shows
    fireEvent.click(thumbDown);
    await vi.advanceTimersByTimeAsync(1);
    expect(screen.getByText("Feedback saved")).toBeTruthy();

    // Advance 2s → t=5.001s. Without the fix, the first tap's timer fires
    // here and hides the toast after only ~2s. With the fix, it's still up.
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText("Feedback saved")).toBeTruthy();

    // Advance another 3s → t=8.001s (full 5s from the second tap). The toast
    // should now be gone.
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText("Feedback saved")).toBeNull();

    vi.useRealTimers();
  });

  // Regression: unmounting while a toast is showing must not leave a timer
  // that calls setShowUndo(false) on unmounted state. React 18 silently
  // swallows this, but it's still wasteful and a latent source of issues.
  it("clears the undo timeout on unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<DACard {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /thumb up for/i }));
    await vi.advanceTimersByTimeAsync(1);
    expect(screen.getByText("Feedback saved")).toBeTruthy();

    unmount();

    // Advance past the 5s mark — should not throw or warn about state
    // updates on unmounted components.
    expect(() => {
      act(() => vi.advanceTimersByTime(5000));
    }).not.toThrow();

    vi.useRealTimers();
  });
});
