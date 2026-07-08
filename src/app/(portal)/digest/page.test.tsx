// Digest page — ?feedback=recorded confirmation toast (issue #55).
// After an email feedback tap the handler 302s to /digest?feedback=recorded;
// this page must surface a "feedback recorded" status banner. Deps are mocked
// so the async server component renders under jsdom without a DB or @/lib/env.
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const validateRequest = vi.fn();
const getCurrentDigest = vi.fn();
const getMyArea = vi.fn();
const getDigestHistory = vi.fn();
const isUserEntitled = vi.fn();
const redirect = vi.fn((_url: string) => {
  throw new Error("REDIRECT");
});

vi.mock("@/lib/auth/session", () => ({
  validateRequest: () => validateRequest(),
}));
vi.mock("@/modules/portal/loaders", () => ({
  getCurrentDigest: () => getCurrentDigest(),
  getMyArea: () => getMyArea(),
  getDigestHistory: () => getDigestHistory(),
  isUserEntitled: () => isUserEntitled(),
}));
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
vi.mock("@/components/digest-view", () => ({
  DigestView: () => <div data-testid="digest-view" />,
}));

import DigestPage from "./page";

async function renderPage(feedback?: string) {
  const el = await DigestPage({ searchParams: Promise.resolve({ feedback }) });
  render(el);
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequest.mockResolvedValue({ user: { id: "user-1" } });
  getMyArea.mockResolvedValue({ lgaBundles: [{ label: "Inner West" }] });
  getDigestHistory.mockResolvedValue([{ sentAt: new Date() }]);
  isUserEntitled.mockResolvedValue(true); // Not lapsed — existing tests assume entitled.
});

describe("DigestPage feedback toast", () => {
  it("shows the confirmation toast when ?feedback=recorded", async () => {
    getCurrentDigest.mockResolvedValue({ id: "d1" });
    await renderPage("recorded");
    expect(screen.getByRole("status")).toHaveTextContent(/feedback was recorded/i);
    expect(screen.getByTestId("digest-view")).toBeInTheDocument();
  });

  it("shows the toast alongside the empty state when there is no digest yet", async () => {
    getCurrentDigest.mockResolvedValue(null);
    await renderPage("recorded");
    expect(screen.getByRole("status")).toHaveTextContent(/feedback was recorded/i);
  });

  it("renders no toast without the query param", async () => {
    getCurrentDigest.mockResolvedValue({ id: "d1" });
    await renderPage(undefined);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("DigestPage empty state — onboarding completeness (issue #123)", () => {
  beforeEach(() => {
    getCurrentDigest.mockResolvedValue(null);
  });

  it("shows a finish-setup CTA (not 'arrives Sunday') when the user never saved a query", async () => {
    getMyArea.mockResolvedValue({
      lgaBundles: [{ label: "Inner West" }],
      savedQueryText: null,
    });
    await renderPage(undefined);

    expect(screen.getByText(/finish setting up your digest/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /add your search query/i });
    expect(cta).toHaveAttribute("href", "/account/saved-query");
    // The false promise must NOT render for an unset-query user.
    expect(screen.queryByText(/your first digest arrives sunday/i)).toBeNull();
  });

  it("shows the 'arrives Sunday' empty state once a saved query exists", async () => {
    getMyArea.mockResolvedValue({
      lgaBundles: [{ label: "Inner West" }],
      savedQueryText: "metal roof replacement",
    });
    await renderPage(undefined);

    expect(screen.getByText(/your first digest arrives sunday/i)).toBeInTheDocument();
    expect(screen.queryByText(/finish setting up your digest/i)).toBeNull();
  });
});

// Issue #236 — entitlement-lapsed state
describe("DigestPage lapsed-trial branch (issue #236)", () => {
  it("renders the LapsedTrialPrompt when the user is NOT entitled (trial past 28d)", async () => {
    isUserEntitled.mockResolvedValue(false);
    getCurrentDigest.mockResolvedValue(null);
    await renderPage(undefined);

    // Must show the re-subscribe CTA.
    const link = screen.getByRole("link", { name: /subscribe to keep your sunday digest/i });
    expect(link).toHaveAttribute("href", "/plan");
    // Must NOT show the false 'arrives Sunday' copy.
    expect(screen.queryByText(/your first digest arrives sunday/i)).toBeNull();
  });

  it("renders the LapsedTrialPrompt even when a stale digest exists", async () => {
    // A lapsed user might have a stale digest from before the entitlement window
    // closed. The page must show the re-subscribe prompt, not the stale digest.
    isUserEntitled.mockResolvedValue(false);
    getCurrentDigest.mockResolvedValue({ id: "stale-d1" });
    await renderPage(undefined);

    expect(screen.getByRole("link", { name: /subscribe to keep your sunday digest/i })).toBeInTheDocument();
    expect(screen.queryByText(/your first digest arrives sunday/i)).toBeNull();
    // The DigestView must NOT render.
    expect(screen.queryByTestId("digest-view")).toBeNull();
  });
});
