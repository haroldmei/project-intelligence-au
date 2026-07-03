import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SignupPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));
vi.mock("react-hook-form", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-hook-form")>();
  return actual;
});

describe("SignupPage", () => {
  it("renders heading and step indicator", () => {
    render(<SignupPage />);
    expect(screen.getByRole("heading", { name: /Start your 28-day trial/i })).toBeTruthy();
    expect(screen.getByText(/Step 1 of 5/i)).toBeTruthy();
  });

  it("renders email, password, mobile, and terms fields", () => {
    render(<SignupPage />);
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
    // Exact match: a "Show password" toggle button also carries a /password/ label.
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
    expect(screen.getByLabelText(/mobile/i)).toBeTruthy();
    expect(screen.getByLabelText(/terms/i)).toBeTruthy();
  });

  it("renders the create account button", () => {
    render(<SignupPage />);
    expect(screen.getByRole("button", { name: /create account/i })).toBeTruthy();
  });

  // Issue #88 / FR-022 (Spam Act 2003): SMS is opted-IN by default at signup, so
  // the signup form MUST disclose the SMS consent + a clear opt-out at the point
  // the mobile number is collected.
  it("discloses the default SMS opt-in and how to opt out (FR-022)", () => {
    render(<SignupPage />);
    const disclosure = screen.getByText(
      /By providing your mobile number you agree to receive your Sunday SMS/i
    );
    expect(disclosure).toBeTruthy();
    // Opt-out path is stated (STOP + account toggle).
    expect(disclosure.textContent).toMatch(/STOP/);
    expect(disclosure.textContent).toMatch(/opt|turn SMS off/i);
    // Wired to the mobile field for screen-reader users.
    expect(disclosure.getAttribute("id")).toBe("sms-disclosure");
    expect(
      screen.getByLabelText(/mobile/i).getAttribute("aria-describedby")
    ).toContain("sms-disclosure");
  });
});
