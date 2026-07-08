import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import QueryPage from "./page";

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
  mockFetch((url) => {
    if (url.endsWith("/api/account/saved-query")) return { saved_query_text: null };
    return {};
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QueryPage", () => {
  it("renders heading and step indicator", () => {
    render(<QueryPage />);
    expect(screen.getByRole("heading", { name: /what kind of jobs/i })).toBeTruthy();
    expect(screen.getByText(/Step 4 of 5/i)).toBeTruthy();
  });

  it("renders a Back control that links to the area step (issue #139)", () => {
    render(<QueryPage />);
    const back = screen.getByRole("link", { name: /back to service area/i });
    expect(back).toBeTruthy();
    expect(back.getAttribute("href")).toBe("/onboarding/area");
  });

  it("pre-fills the previously saved query when returning to the step", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/account/saved-query")) return { saved_query_text: "Re-roofs in Blacktown" };
      return {};
    });
    render(<QueryPage />);
    await waitFor(() =>
      expect((screen.getByLabelText(/your job profile/i) as HTMLTextAreaElement).value).toBe(
        "Re-roofs in Blacktown",
      ),
    );
  });

  describe("minimum-length hint (issue #250)", () => {
    it("shows the minimum length in the counter", () => {
      render(<QueryPage />);
      const hint = screen.getByText("(min 5)");
      expect(hint).toBeTruthy();
    });

    it("shows a red inline message when the trimmed text is under 5 characters", async () => {
      render(<QueryPage />);
      const textarea = screen.getByLabelText(/your job profile/i);
      fireEvent.change(textarea, { target: { value: "roof" } });
      expect(screen.getByText(/A few more words — min 5 characters/i)).toBeTruthy();
    });

    it("hides the inline message when the trimmed text reaches 5 characters", async () => {
      render(<QueryPage />);
      const textarea = screen.getByLabelText(/your job profile/i);
      fireEvent.change(textarea, { target: { value: "roofs" } });
      expect(screen.queryByText(/A few more words — min 5 characters/i)).toBeNull();
    });

    it("hides the inline message when the trimmed text exceeds the minimum", async () => {
      render(<QueryPage />);
      const textarea = screen.getByLabelText(/your job profile/i);
      fireEvent.change(textarea, { target: { value: "Re-roofs in Blacktown" } });
      expect(screen.queryByText(/A few more words — min 5 characters/i)).toBeNull();
    });

    it("keeps Continue disabled when text is under 5 characters", async () => {
      render(<QueryPage />);
      const textarea = screen.getByLabelText(/your job profile/i);
      fireEvent.change(textarea, { target: { value: "roof" } });
      const btn = screen.getByRole("button", { name: /continue/i });
      expect(btn).toBeTruthy();
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
