// Component test for the storm-brief opt-out toggle page (#20).
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StormBriefPage from "./page";

type FetchArgs = Parameters<typeof fetch>;

function mockFetch(meOptIn: boolean) {
  const calls: { url: string; init?: RequestInit }[] = [];
  global.fetch = vi.fn((url: FetchArgs[0], init?: FetchArgs[1]) => {
    const u = String(url);
    calls.push({ url: u, init: init as RequestInit });
    if (u === "/api/account/me") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ stormBriefOptIn: meOptIn }),
      } as Response);
    }
    // POST /api/account/storm-brief
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ stormBriefOptIn: !meOptIn }),
    } as Response);
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StormBriefPage", () => {
  it("loads the current opt-in state into the switch", async () => {
    mockFetch(true);
    render(<StormBriefPage />);
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
  });

  it("posts optIn:false when toggling off", async () => {
    const calls = mockFetch(true);
    render(<StormBriefPage />);
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));

    fireEvent.click(toggle);

    await waitFor(() => {
      const post = calls.find((c) => c.url === "/api/account/storm-brief");
      expect(post).toBeTruthy();
      expect(post!.init?.method).toBe("POST");
      expect(JSON.parse(String(post!.init?.body))).toEqual({ optIn: false });
    });
    // optimistic flip
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("renders the Bureau of Meteorology attribution", async () => {
    mockFetch(true);
    render(<StormBriefPage />);
    await screen.findByRole("switch");
    expect(screen.getByText(/Warning data © Bureau of Meteorology/i)).toBeTruthy();
  });
});
