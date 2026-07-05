// Component test for the SMS opt-in page (#167). The no-mobile state must
// offer a one-tap path to add a mobile number, not dead-end the user.
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SMSOptInPage from "./page";

type FetchArgs = Parameters<typeof fetch>;

function mockFetch(me: { smsOptIn?: boolean; mobile_e164?: string | null }) {
  global.fetch = vi.fn((url: FetchArgs[0]) => {
    const u = String(url);
    if (u === "/api/account/me") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(me),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SMSOptInPage", () => {
  it("renders a link to /account/profile when the account has no mobile", async () => {
    mockFetch({ smsOptIn: false, mobile_e164: null });
    render(<SMSOptInPage />);

    const link = await screen.findByRole("link", { name: /add your mobile number/i });
    expect(link.getAttribute("href")).toBe("/account/profile");
  });

  it("keeps the toggle disabled while no mobile exists", async () => {
    mockFetch({ smsOptIn: false, mobile_e164: null });
    render(<SMSOptInPage />);

    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(true));
  });

  it("does not show the add-mobile link once a mobile exists", async () => {
    mockFetch({ smsOptIn: false, mobile_e164: "+61400000000" });
    render(<SMSOptInPage />);

    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("link", { name: /add your mobile number/i })).toBeNull();
  });
});
