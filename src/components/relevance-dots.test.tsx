import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RelevanceDots } from "./relevance-dots";

describe("RelevanceDots", () => {
  it("renders with accessible aria-label", () => {
    render(<RelevanceDots score={8} />);
    // score 8 → 4 of 5 filled
    expect(screen.getByLabelText(/Relevance: 4 of 5/i)).toBeTruthy();
  });

  it("renders 5 dot elements", () => {
    const { container } = render(<RelevanceDots score={6} />);
    const dots = container.querySelectorAll("[aria-hidden]");
    expect(dots.length).toBe(5);
  });
});
