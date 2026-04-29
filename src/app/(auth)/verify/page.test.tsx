import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import VerifyPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("VerifyPage", () => {
  it("renders heading and step indicator", () => {
    render(<VerifyPage />);
    expect(screen.getByRole("heading", { name: /Check your email/i })).toBeTruthy();
    expect(screen.getByText(/Step 2 of 4/i)).toBeTruthy();
  });

  it("renders 6 OTP digit inputs", () => {
    render(<VerifyPage />);
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(new RegExp(`Digit ${i} of 6`, "i"))).toBeTruthy();
    }
  });

  it("renders verify button (disabled by default)", () => {
    render(<VerifyPage />);
    const btn = screen.getByRole("button", { name: /verify email/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
