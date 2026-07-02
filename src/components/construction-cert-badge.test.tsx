import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ConstructionCertBadge } from "./construction-cert-badge";

describe("ConstructionCertBadge", () => {
  it("renders the 'CC issued — work starting' label with a formatted date", () => {
    render(<ConstructionCertBadge issuedDate="2026-06-01" />);
    expect(screen.getByText("CC issued 1 Jun 2026 — work starting")).toBeTruthy();
  });

  it("formats a two-digit day without a leading zero", () => {
    render(<ConstructionCertBadge issuedDate="2026-12-15" />);
    expect(screen.getByText(/15 Dec 2026/)).toBeTruthy();
  });

  it("exposes an accessible label", () => {
    render(<ConstructionCertBadge issuedDate="2026-06-01" />);
    expect(
      screen.getByLabelText(/Construction Certificate issued 1 Jun 2026 — work starting/i),
    ).toBeTruthy();
  });

  it("falls back to the raw string for an unparseable date rather than crashing", () => {
    render(<ConstructionCertBadge issuedDate="not-a-date" />);
    expect(screen.getByText(/CC issued not-a-date — work starting/)).toBeTruthy();
  });
});
