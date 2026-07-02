// Cookie banner ↔ analytics wiring (issue #17): accepting starts PostHog in
// place (no reload); rejecting starts nothing. posthog init itself is covered
// in src/lib/analytics/browser.test.ts — here we assert the banner calls it.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { initAnalyticsMock } = vi.hoisted(() => ({ initAnalyticsMock: vi.fn() }));

vi.mock("@/lib/analytics/browser", () => ({
  COOKIE_CONSENT_KEY: "pi_cookie_consent",
  initAnalytics: initAnalyticsMock,
}));

import { CookieConsent } from "./cookie-consent";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("CookieConsent", () => {
  it("shows the banner when no preference is stored", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("dialog", { name: /cookie consent/i })).toBeTruthy();
  });

  it("Accept persists consent and starts analytics (no reload)", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: /accept all cookies/i }));
    expect(window.localStorage.getItem("pi_cookie_consent")).toBe("accepted");
    expect(initAnalyticsMock).toHaveBeenCalledTimes(1);
  });

  it("Reject persists rejection and does NOT start analytics", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: /reject analytics cookies/i }));
    expect(window.localStorage.getItem("pi_cookie_consent")).toBe("rejected");
    expect(initAnalyticsMock).not.toHaveBeenCalled();
  });

  it("stays hidden once a preference already exists", () => {
    window.localStorage.setItem("pi_cookie_consent", "accepted");
    render(<CookieConsent />);
    expect(screen.queryByRole("dialog", { name: /cookie consent/i })).toBeNull();
  });
});
