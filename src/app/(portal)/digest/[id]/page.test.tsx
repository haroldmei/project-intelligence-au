// Digest-detail area labelling (issue #138). The detail header must show the area
// the digest was SENT under (its stored snapshot), not the user's current area.
// A tradie who later widened their area must still see an old digest's original
// area; legacy digests with no snapshot fall back to the live area. DigestView is
// mocked to surface the areaLabel it receives; loaders/auth are mocked so this
// async server component renders under jsdom without a DB.
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const validateRequest = vi.fn();
const getDigestById = vi.fn();
const getDigestHistory = vi.fn();
const getMyArea = vi.fn();
const redirect = vi.fn((_url: string) => {
  throw new Error("REDIRECT");
});
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});

vi.mock("@/lib/auth/session", () => ({
  validateRequest: () => validateRequest(),
}));
vi.mock("@/modules/portal/loaders", () => ({
  getDigestById: () => getDigestById(),
  getDigestHistory: () => getDigestHistory(),
  getMyArea: () => getMyArea(),
}));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => redirect(u),
  notFound: () => notFound(),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...p }: { children: React.ReactNode; [k: string]: unknown }) => (
    <a {...p}>{children}</a>
  ),
}));
vi.mock("@/components/digest-view", () => ({
  DigestView: ({ areaLabel }: { areaLabel: string }) => (
    <div data-testid="digest-view" data-area-label={areaLabel} />
  ),
}));

import DigestDetailPage from "./page";

async function renderPage(id = "dg_1") {
  render(await DigestDetailPage({ params: Promise.resolve({ id }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequest.mockResolvedValue({ user: { id: "user-1" } });
  getDigestHistory.mockResolvedValue([]);
  // Live area is now WIDER than when the digest was sent.
  getMyArea.mockResolvedValue({
    lgaBundles: [{ label: "Western Sydney" }, { label: "Northern Sydney" }],
  });
});

describe("DigestDetailPage area label (issue #138)", () => {
  it("passes the digest's send-time area to DigestView, not the current area", async () => {
    getDigestById.mockResolvedValue({ id: "dg_old", areaLabel: "Western Sydney" });

    await renderPage("dg_old");

    expect(screen.getByTestId("digest-view")).toHaveAttribute(
      "data-area-label",
      "Western Sydney",
    );
  });

  it("falls back to the live area for a legacy digest with no snapshot", async () => {
    getDigestById.mockResolvedValue({ id: "dg_legacy", areaLabel: null });

    await renderPage("dg_legacy");

    expect(screen.getByTestId("digest-view")).toHaveAttribute(
      "data-area-label",
      "Western Sydney + Northern Sydney",
    );
  });
});
