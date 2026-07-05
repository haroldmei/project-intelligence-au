// History page area labelling (issue #138). Each past digest must show the area
// it was SENT under — its stored snapshot — not the user's current area. A tradie
// who widens 'Western Sydney' → 'Western Sydney + Northern Sydney' must still see
// old digests labelled 'Western Sydney'. Legacy digests with no snapshot fall
// back to the live area. Loaders/auth are mocked so this async server component
// renders under jsdom without a DB.
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const validateRequest = vi.fn();
const getDigestHistory = vi.fn();
const getMyArea = vi.fn();
const redirect = vi.fn((_url: string) => {
  throw new Error("REDIRECT");
});

vi.mock("@/lib/auth/session", () => ({
  validateRequest: () => validateRequest(),
}));
vi.mock("@/modules/portal/loaders", () => ({
  getDigestHistory: () => getDigestHistory(),
  getMyArea: () => getMyArea(),
}));
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import HistoryPage from "./page";

const emptyClasses = { fast_track: 0, strata_heritage: 0, builder_pipeline: 0 };

function digestRow(overrides: Record<string, unknown>) {
  return {
    id: "dg_1",
    sentAt: "2026-06-28T09:00:00.000Z",
    daCount: 3,
    emailStatus: "sent",
    smsStatus: null,
    fallbackUsed: false,
    runDate: "2026-06-28",
    leadClassCounts: emptyClasses,
    areaLabel: null,
    ...overrides,
  };
}

async function renderPage() {
  render(await HistoryPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequest.mockResolvedValue({ user: { id: "user-1" } });
  // Live area is now WIDER than when the old digest was sent.
  getMyArea.mockResolvedValue({
    lgaBundles: [{ label: "Western Sydney" }, { label: "Northern Sydney" }],
  });
});

describe("HistoryPage area label (issue #138)", () => {
  it("shows a past digest's send-time area, not the user's current (wider) area", async () => {
    getDigestHistory.mockResolvedValue([
      digestRow({ id: "dg_old", areaLabel: "Western Sydney" }),
    ]);

    await renderPage();

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Western Sydney")).toBeInTheDocument();
    expect(
      within(row).queryByText("Western Sydney + Northern Sydney"),
    ).toBeNull();
  });

  it("falls back to the live area for a legacy digest with no snapshot", async () => {
    getDigestHistory.mockResolvedValue([
      digestRow({ id: "dg_legacy", areaLabel: null }),
    ]);

    await renderPage();

    const row = screen.getByRole("listitem");
    expect(
      within(row).getByText("Western Sydney + Northern Sydney"),
    ).toBeInTheDocument();
  });
});
