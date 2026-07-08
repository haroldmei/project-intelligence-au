// Component test for the My Service Area page (#235). Must render the standard
// '← Account' back link matching every other account sub-page.
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import MyAreaPage from "./page";

type FetchArgs = Parameters<typeof fetch>;

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn((url: FetchArgs[0]) => {
    const u = String(url);
    if (u === "/api/account/lga-bundles") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ bundle_ids: ["western_sydney"] }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as unknown as typeof fetch;
});

describe("MyAreaPage — back link", () => {
  it("renders a link to /account with accessible name 'Back to account settings'", async () => {
    render(<MyAreaPage />);

    const link = await screen.findByRole("link", { name: /back to account settings/i });
    expect(link.getAttribute("href")).toBe("/account");
    expect(link.textContent).toContain("← Account");
  });
});
