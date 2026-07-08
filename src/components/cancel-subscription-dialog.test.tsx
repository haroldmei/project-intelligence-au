// Post-cancel Undo/reactivate (issue #56, design §7.10b): the confirmation
// toast must carry an [Undo] action that POSTs a reactivate and clears the
// pending-cancellation state in-product — no Stripe portal round-trip.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { CancelSubscriptionDialog } from "./cancel-subscription-dialog";

const PERIOD_END = "2026-05-24T00:00:00Z";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CancelSubscriptionDialog — Undo/reactivate", () => {
  it("shows an [Undo] action in the confirmation toast after cancelling", async () => {
    mockFetch(async () => jsonResponse({ accessUntil: PERIOD_END }));
    render(
      <CancelSubscriptionDialog open onOpenChange={() => {}} periodEnd={PERIOD_END} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^cancel subscription$/i }));

    const undo = await vi.waitFor(() => screen.getByRole("button", { name: /undo/i }));
    expect(undo).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/24 May 2026/);
  });

  it("clicking [Undo] POSTs the reactivate endpoint and fires onReactivated", async () => {
    const fetchMock = mockFetch(async (_url, init) => {
      if (init?.method === "DELETE") return jsonResponse({ accessUntil: PERIOD_END });
      if (init?.method === "POST") return jsonResponse({ accessUntil: PERIOD_END });
      return jsonResponse({});
    });
    const onReactivated = vi.fn();

    render(
      <CancelSubscriptionDialog
        open
        onOpenChange={() => {}}
        periodEnd={PERIOD_END}
        onReactivated={onReactivated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^cancel subscription$/i }));
    const undo = await vi.waitFor(() => screen.getByRole("button", { name: /undo/i }));

    fireEvent.click(undo);

    await vi.waitFor(() => expect(onReactivated).toHaveBeenCalledWith(PERIOD_END));
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/subscription", { method: "POST" });
    // Confirmation flips to a "resumed" message with no further action.
    await vi.waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/resumed/i),
    );
  });

  it("sends the selected cancellation reason in the DELETE body (issue #96 A5)", async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ accessUntil: PERIOD_END }));

    render(<CancelSubscriptionDialog open onOpenChange={() => {}} periodEnd={PERIOD_END} />);

    fireEvent.change(screen.getByLabelText(/mind telling us why/i), {
      target: { value: "not_enough_leads" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel subscription$/i }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "not_enough_leads" });
  });

  it("omits the body when no reason is chosen (reason is optional)", async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ accessUntil: PERIOD_END }));

    render(<CancelSubscriptionDialog open onOpenChange={() => {}} periodEnd={PERIOD_END} />);
    fireEvent.click(screen.getByRole("button", { name: /^cancel subscription$/i }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeUndefined();
  });

  it("keeps a resume path when the [Undo] POST fails", async () => {
    mockFetch(async (_url, init) => {
      if (init?.method === "DELETE") return jsonResponse({ accessUntil: PERIOD_END });
      return jsonResponse({ error: "boom" }, false);
    });
    const onReactivated = vi.fn();

    render(
      <CancelSubscriptionDialog
        open
        onOpenChange={() => {}}
        periodEnd={PERIOD_END}
        onReactivated={onReactivated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^cancel subscription$/i }));
    const undo = await vi.waitFor(() => screen.getByRole("button", { name: /undo/i }));
    fireEvent.click(undo);

    await vi.waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/couldn.t resume/i),
    );
    expect(onReactivated).not.toHaveBeenCalled();
  });
});
