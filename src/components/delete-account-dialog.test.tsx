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

// ---------------------------------------------------------------------------
// Focus trap & keyboard behaviour (issue #216)
// ---------------------------------------------------------------------------
describe("DeleteAccountDialog — focus trap & keyboard behaviour", () => {
  it("moves focus to the confirmation input when opened", async () => {
    render(<DeleteAccountDialog open onOpenChange={() => {}} onDeleted={() => {}} />);
    // The dialog focuses the input via setTimeout(0) — wait for it to fire.
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByLabelText(/type delete to confirm/i),
      );
    });
  });

  it("traps Tab focus — cycles from last element back to first", () => {
    render(<DeleteAccountDialog open onOpenChange={() => {}} onDeleted={() => {}} />);

    const input = screen.getByLabelText(/type delete to confirm/i);
    const keepBtn = screen.getByRole("button", { name: /keep my account/i });

    // With nothing typed the delete button is disabled and not Tab-focusable,
    // so the cycle is: input (first) ⇄ keep (last).
    // Tab from keep → cycles to input.
    keepBtn.focus();
    fireEvent.keyDown(keepBtn, { key: "Tab", bubbles: true });
    expect(document.activeElement).toBe(input);
  });

  it("includes the delete button in the focus cycle once armed", () => {
    render(<DeleteAccountDialog open onOpenChange={() => {}} onDeleted={() => {}} />);

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "DELETE" },
    });

    const input = screen.getByLabelText(/type delete to confirm/i);
    const keepBtn = screen.getByRole("button", { name: /keep my account/i });

    // When armed the DOM order is: input (first) → delete (middle) → keep (last).
    // Tab from last still cycles to first, confirming the 3-element cycle
    // (including the delete button) works correctly.
    keepBtn.focus();
    fireEvent.keyDown(keepBtn, { key: "Tab", bubbles: true });
    expect(document.activeElement).toBe(input);
  });

  it("traps Shift+Tab — cycles from first element to last", () => {
    render(<DeleteAccountDialog open onOpenChange={() => {}} onDeleted={() => {}} />);

    const input = screen.getByLabelText(/type delete to confirm/i);
    const keepBtn = screen.getByRole("button", { name: /keep my account/i });

    // Shift+Tab on input (first) → cycles to keep (last)
    input.focus();
    fireEvent.keyDown(input, { key: "Tab", bubbles: true, shiftKey: true });
    expect(document.activeElement).toBe(keepBtn);
  });

  it("restores focus to the trigger button on close", () => {
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <div>
        <button data-testid="trigger">Delete account</button>
        <DeleteAccountDialog
          open={false}
          onOpenChange={onOpenChange}
          onDeleted={() => {}}
        />
      </div>,
    );

    const trigger = screen.getByTestId("trigger");
    trigger.focus();

    // Open — useFocusTrap captures the trigger
    rerender(
      <div>
        <button data-testid="trigger">Delete account</button>
        <DeleteAccountDialog
          open={true}
          onOpenChange={onOpenChange}
          onDeleted={() => {}}
        />
      </div>,
    );

    // Close — focus must return to the trigger
    rerender(
      <div>
        <button data-testid="trigger">Delete account</button>
        <DeleteAccountDialog
          open={false}
          onOpenChange={onOpenChange}
          onDeleted={() => {}}
        />
      </div>,
    );

    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    render(<DeleteAccountDialog open onOpenChange={onOpenChange} onDeleted={() => {}} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
