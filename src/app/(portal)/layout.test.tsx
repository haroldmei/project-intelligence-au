// Portal layout — verification gate (issue #180).
// A Lucia session is minted at signup with emailVerified=false, but the Sunday
// digest cron only sends to emailVerified:true users. Without this gate an
// unverified user reaches /digest and sees "your first digest arrives Sunday"
// yet never receives one. The layout must bounce unverified sessions to /verify.
// Deps are mocked so the async server component runs under jsdom without a DB.
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const validateRequest = vi.fn();
const redirect = vi.fn((_url: string) => {
  throw new Error(`REDIRECT:${_url}`);
});
const getHeader = vi.fn<(name: string) => string | null>(() => null);

vi.mock("@/lib/auth/session", () => ({
  validateRequest: () => validateRequest(),
}));
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => getHeader(name) }),
}));
vi.mock("@/components/analytics-provider", () => ({
  AnalyticsProvider: () => <div data-testid="analytics-provider" />,
}));
vi.mock("./portal-nav", () => ({
  PortalNav: () => <nav data-testid="portal-nav" />,
}));

import PortalLayout from "./layout";

async function renderLayout() {
  const el = await PortalLayout({ children: <div data-testid="child" /> });
  render(el);
}

beforeEach(() => {
  vi.clearAllMocks();
  getHeader.mockReturnValue(null);
});

describe("PortalLayout verification gate (issue #180)", () => {
  it("redirects an unverified session to /verify before rendering the portal", async () => {
    validateRequest.mockResolvedValue({
      user: { id: "u1", emailVerified: false },
      session: { id: "s1" },
    });
    await expect(renderLayout()).rejects.toThrow("REDIRECT:/verify");
    expect(redirect).toHaveBeenCalledWith("/verify");
  });

  it("renders the portal for a verified session", async () => {
    validateRequest.mockResolvedValue({
      user: { id: "u1", emailVerified: true },
      session: { id: "s1" },
    });
    await renderLayout();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated request to login, not /verify", async () => {
    validateRequest.mockResolvedValue(null);
    await expect(renderLayout()).rejects.toThrow(/REDIRECT:\/login/);
    // The login redirect must fire; the verify gate must not run without a user.
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalledWith("/verify");
  });
});
