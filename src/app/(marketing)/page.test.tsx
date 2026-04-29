/**
 * Landing page smoke test.
 * Asserts that the wedge sentence is present and the CTA is renderable.
 * Tests the (marketing)/page.tsx component directly.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MarketingPage from "./page";

// next/link renders a plain <a> in tests
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("MarketingPage (landing page)", () => {
  it("renders the wedge sentence headline", () => {
    render(<MarketingPage />);
    expect(
      screen.getByText(/The Sunday-night roofing DA digest for Sydney subbies/i)
    ).toBeTruthy();
  });

  it("renders Start free trial CTA linking to /signup", () => {
    render(<MarketingPage />);
    const ctas = screen.getAllByRole("link", { name: /start free trial/i });
    expect(ctas.length).toBeGreaterThan(0);
    expect(ctas[0].getAttribute("href")).toBe("/signup");
  });

  it("renders Solo and Team pricing plans", () => {
    render(<MarketingPage />);
    expect(screen.getByText(/AUD 199\/mo/)).toBeTruthy();
    expect(screen.getByText(/AUD 499\/mo/)).toBeTruthy();
  });

  it("renders main navigation landmark", () => {
    render(<MarketingPage />);
    expect(screen.getByRole("navigation", { name: /main navigation/i })).toBeTruthy();
  });

  it("renders Log in link", () => {
    render(<MarketingPage />);
    const loginLink = screen.getByRole("link", { name: /log in/i });
    expect(loginLink.getAttribute("href")).toBe("/login");
  });
});
