// Component test for LapsedTrialPrompt — the re-subscribe prompt shown on /digest
// when a self-signup trial has lapsed (issue #236). Mirrors the FinishSetupPrompt
// pattern (issue #123). The acceptance criterion requires a CTA linking to /plan
// and no false "arrives Sunday" copy.
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LapsedTrialPrompt } from "./lapsed-trial-prompt";

describe("LapsedTrialPrompt", () => {
  it("renders the trial-ended heading", () => {
    render(<LapsedTrialPrompt />);
    expect(screen.getByText("Your Digest")).toBeTruthy();
    expect(screen.getByText("Your trial has ended.")).toBeTruthy();
  });

  it("renders a re-subscribe CTA linking to /plan", () => {
    render(<LapsedTrialPrompt />);
    const link = screen.getByRole("link", {
      name: /subscribe to keep your sunday digest/i,
    });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/plan");
  });

  it("does NOT render the false 'arrives Sunday' copy", () => {
    render(<LapsedTrialPrompt />);
    // The EmptyState phrase must never appear in the lapsed-trial prompt.
    expect(screen.queryByText(/arrives Sunday/i)).toBeNull();
    expect(screen.queryByText(/your first digest/i)).toBeNull();
  });

  it("includes copy about the trial having expired and DA delivery being paused", () => {
    render(<LapsedTrialPrompt />);
    expect(screen.getByText(/free trial has expired/i)).toBeTruthy();
    expect(screen.getByText(/DA lead delivery has been paused/i)).toBeTruthy();
  });
});
