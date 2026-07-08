import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AreaPage from "./page";

const { push, router } = vi.hoisted(() => {
  const push = vi.fn();
  return { push, router: { push } };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = handler(String(url), init);
      return { ok: true, status: 200, json: async () => body } as Response;
    }),
  );
}

beforeEach(() => {
  push.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AreaPage", () => {
  it("renders heading and step indicator", () => {
    mockFetch(() => ({ bundle_ids: [] }));
    render(<AreaPage />);
    expect(screen.getByRole("heading", { name: /choose your service area/i })).toBeTruthy();
    expect(screen.getByText(/Step 3 of 4/i)).toBeTruthy();
  });

  it("starts with the Continue button disabled when nothing is saved", async () => {
    mockFetch(() => ({ bundle_ids: [] }));
    render(<AreaPage />);
    const btn = screen.getByRole("button", { name: /continue/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("pre-fills previously saved bundles as checked when returning to the step (issue #139)", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/account/lga-bundles")) return { bundle_ids: ["western_sydney"] };
      return {};
    });
    render(<AreaPage />);

    // The saved bundle button is marked selected once the GET resolves…
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /western sydney/i }) as HTMLButtonElement).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true"),
    );
    // …and an unsaved one stays unselected.
    expect(
      (screen.getByRole("button", { name: /northern sydney/i }) as HTMLButtonElement).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");

    // With a bundle pre-selected, Continue is immediately usable.
    expect((screen.getByRole("button", { name: /continue/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
