// AlertDialog focus-trap & accessibility (issue #216). Both consequential confirm
// modals (churn cancellation + irreversible account deletion) are hand-rolled
// dialogs that must trap Tab/Shift+Tab focus while open and restore focus to the
// trigger on close — matching the Radix-equivalent behaviour the docstring claimed.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AlertDialog } from "./alert-dialog";

// DOM order within the dialog card: Confirm button first, Cancel button second.
//   first = Confirm   |   last = Keep my plan
// Tab cycles: last → first  |  Shift+Tab cycles: first → last

describe("AlertDialog — focus trap & keyboard behaviour", () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Confirm action",
    description: "Are you sure?",
    confirmLabel: "Confirm",
    onConfirm: vi.fn(),
  } as const;

  it("moves focus to the cancel button when opened", () => {
    render(<AlertDialog {...baseProps} />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /keep my plan/i }),
    );
  });

  it("traps Tab focus — cycles from last element back to first", () => {
    render(<AlertDialog {...baseProps} />);

    const first = screen.getByRole("button", { name: /^confirm$/i });
    const last = screen.getByRole("button", { name: /keep my plan/i });

    // Initial focus is on cancel (the safe default), which is the LAST element.
    expect(document.activeElement).toBe(last);

    // Tab from last → handler cycles back to first
    fireEvent.keyDown(last, { key: "Tab", bubbles: true });
    expect(document.activeElement).toBe(first);
  });

  it("traps Shift+Tab focus — cycles from first element back to last", () => {
    render(<AlertDialog {...baseProps} />);

    const first = screen.getByRole("button", { name: /^confirm$/i });
    const last = screen.getByRole("button", { name: /keep my plan/i });

    // Focus the first element and press Shift+Tab → cycles to last
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", bubbles: true, shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("does not intervene on Tab when focus is at an intermediate element", () => {
    render(
      <AlertDialog
        {...baseProps}
        description={
          <>
            Are you sure?
            <a href="/help">Learn more</a>
          </>
        }
      />,
    );

    const link = screen.getByRole("link", { name: /learn more/i });

    // DOM order: link (first), Confirm, Keep my plan (last).
    // Tab from link (first) — handler only cycles on Tab-from-last, so no-op.
    link.focus();
    fireEvent.keyDown(link, { key: "Tab", bubbles: true });
    expect(document.activeElement).toBe(link);
  });

  it("restores focus to the trigger button on close", async () => {
    const onOpenChange = vi.fn();

    // Start closed so we can set up the trigger's focus state
    const { rerender } = render(
      <div>
        <button data-testid="trigger">Open dialog</button>
        <AlertDialog
          open={false}
          onOpenChange={onOpenChange}
          title="Title"
          description="Desc"
          confirmLabel="Confirm"
          onConfirm={vi.fn()}
        />
      </div>,
    );

    const trigger = screen.getByTestId("trigger");
    trigger.focus();

    // Open the dialog — useFocusTrap stores the trigger
    rerender(
      <div>
        <button data-testid="trigger">Open dialog</button>
        <AlertDialog
          open={true}
          onOpenChange={onOpenChange}
          title="Title"
          description="Desc"
          confirmLabel="Confirm"
          onConfirm={vi.fn()}
        />
      </div>,
    );

    // Close the dialog — focus must return to the trigger
    rerender(
      <div>
        <button data-testid="trigger">Open dialog</button>
        <AlertDialog
          open={false}
          onOpenChange={onOpenChange}
          title="Title"
          description="Desc"
          confirmLabel="Confirm"
          onConfirm={vi.fn()}
        />
      </div>,
    );

    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    render(<AlertDialog {...baseProps} onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
