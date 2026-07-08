// Privacy self-service (issue #96 A1): the /privacy policy promises a "Delete
// account" control in settings. This dialog must (a) gate the destructive call
// behind a type-to-confirm word, (b) DELETE /api/account/delete, and (c) fire
// onDeleted so the page signs the (now erased) user out.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DeleteAccountDialog } from "./delete-account-dialog";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function response(ok: boolean, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => ({}) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeleteAccountDialog", () => {
  it("keeps the delete button disabled until the confirm word is typed", () => {
    render(<DeleteAccountDialog open onOpenChange={() => {}} onDeleted={() => {}} />);

    const btn = screen.getByRole("button", { name: /delete my account/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "nope" },
    });
    expect((btn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "delete" }, // case-insensitive
    });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("DELETEs the erasure endpoint and calls onDeleted on success", async () => {
    const fetchMock = mockFetch(async () => response(true));
    const onDeleted = vi.fn();

    render(<DeleteAccountDialog open onOpenChange={() => {}} onDeleted={onDeleted} />);
    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));

    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/account/delete", { method: "DELETE" });
  });

  it("surfaces an error and does not sign out when the DELETE fails", async () => {
    mockFetch(async () => response(false));
    const onDeleted = vi.fn();

    render(<DeleteAccountDialog open onOpenChange={() => {}} onDeleted={onDeleted} />);
    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));

    await vi.waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/couldn.t delete/i),
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
