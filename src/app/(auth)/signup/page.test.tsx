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
    expect(screen.getByText(/Step 1 of 4/i)).toBeTruthy();
  });

  it("renders email, password, mobile, and terms fields", () => {
    render(<SignupPage />);
    expect(screen.getByLabelText(/email address/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.getByLabelText(/mobile/i)).toBeTruthy();
    expect(screen.getByLabelText(/terms/i)).toBeTruthy();
  });

  it("renders the create account button", () => {
    render(<SignupPage />);
    expect(screen.getByRole("button", { name: /create account/i })).toBeTruthy();
  });
});
