// Weekly rated-lead recap stat (CF-1.7, issue #51; relabelled #186). The badge
// slot above the DA cards must render the honest on-target recap ONLY from week 4
// with a computed value, and otherwise show the onboarding tip — never an empty
// slot, and never the misleading "precision" label.
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DigestHeader } from "./digest-header";

const TIP = /your digest gets smarter as you use it/i;

describe("DigestHeader — rated-lead recap (CF-1.7, #186)", () => {
  it("renders the RatedLeadBadge when weeksOfHistory >= 4 and a recap is defined", () => {
    render(
      <DigestHeader
        weekDate="27 Apr 2026"
        leadCount={7}
        areaLabel="Inner West"
        ratedLeadRecap={{ onTarget: 14, rated: 15, rate: 93, weeks: 4 }}
        weeksOfHistory={4}
      />,
    );
    expect(screen.getByText("14 of 15 rated on-target")).toBeTruthy();
    // Always the trailing-4-week window, regardless of total history length.
    expect(screen.getByText("4-week")).toBeTruthy();
    // Never the misleading "precision" label (issue #186).
    expect(screen.queryByText(/precision/)).toBeNull();
    // ...and the onboarding tip is gone once the proof stat shows.
    expect(screen.queryByText(TIP)).toBeNull();
  });

  it("shows the onboarding tip (not the badge) below 4 weeks of history", () => {
    render(
      <DigestHeader
        weekDate="27 Apr 2026"
        leadCount={7}
        areaLabel="Inner West"
        ratedLeadRecap={{ onTarget: 14, rated: 15, rate: 93, weeks: 4 }}
        weeksOfHistory={2}
      />,
    );
    expect(screen.queryByText(/on-target/)).toBeNull();
    expect(screen.getByText(TIP)).toBeTruthy();
  });

  it("shows the tip (not an empty slot) at 4+ weeks when the recap is undefined", () => {
    // A user who never thumbed a card has no honest recap to show yet.
    render(
      <DigestHeader
        weekDate="27 Apr 2026"
        leadCount={7}
        areaLabel="Inner West"
        weeksOfHistory={6}
      />,
    );
    expect(screen.queryByText(/on-target/)).toBeNull();
    expect(screen.getByText(TIP)).toBeTruthy();
  });
});
