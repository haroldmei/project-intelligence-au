// Weekly precision recap stat (CF-1.7, issue #51). The badge slot above the DA
// cards must render the precision proof ONLY from week 4 with a computed value,
// and otherwise show the onboarding tip — never an empty slot.
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DigestHeader } from "./digest-header";

const TIP = /your digest gets smarter as you use it/i;

describe("DigestHeader — precision recap (CF-1.7)", () => {
  it("renders the PrecisionBadge when weeksOfHistory >= 4 and precision is defined", () => {
    render(
      <DigestHeader
        weekDate="27 Apr 2026"
        leadCount={7}
        areaLabel="Inner West"
        precision={93}
        weeksOfHistory={4}
      />,
    );
    expect(screen.getByText("93% precision")).toBeTruthy();
    // Always the trailing-4-week window, regardless of total history length.
    expect(screen.getByText("4-week avg")).toBeTruthy();
    // ...and the onboarding tip is gone once the proof stat shows.
    expect(screen.queryByText(TIP)).toBeNull();
  });

  it("shows the onboarding tip (not the badge) below 4 weeks of history", () => {
    render(
      <DigestHeader
        weekDate="27 Apr 2026"
        leadCount={7}
        areaLabel="Inner West"
        precision={93}
        weeksOfHistory={2}
      />,
    );
    expect(screen.queryByText(/precision/)).toBeNull();
    expect(screen.getByText(TIP)).toBeTruthy();
  });

  it("shows the tip (not an empty slot) at 4+ weeks when precision is undefined", () => {
    // A user who never thumbed a card has no honest precision to show yet.
    render(
      <DigestHeader
        weekDate="27 Apr 2026"
        leadCount={7}
        areaLabel="Inner West"
        weeksOfHistory={6}
      />,
    );
    expect(screen.queryByText(/precision/)).toBeNull();
    expect(screen.getByText(TIP)).toBeTruthy();
  });

  it("rounds the precision value in the badge", () => {
    render(
      <DigestHeader
        weekDate="27 Apr 2026"
        leadCount={7}
        areaLabel="Inner West"
        precision={66.7}
        weeksOfHistory={5}
      />,
    );
    expect(screen.getByText("67% precision")).toBeTruthy();
  });
});
