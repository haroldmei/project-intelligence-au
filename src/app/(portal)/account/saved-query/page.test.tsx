// Component test for the saved-query page. Save failures (server error, 429
// rate-limit, network error) must render as a role=alert error, never inside
// the green polite success toast (#185).
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SavedQueryPage from "./page";

type FetchArgs = Parameters<typeof fetch>;

/**
 * Load succeeds with the given saved query; PUT resolves with the supplied
 * `put` response (defaults to a 500 server error).
 */
function mockFetch(
  savedQuery: string | null,
  put: { ok: boolean; status?: number; body?: unknown } = { ok: false, status: 500 },
) {
  global.fetch = vi.fn((url: FetchArgs[0], init?: FetchArgs[1]) => {
    const u = String(url);
    if (u === "/api/account/saved-query" && init?.method === "PUT") {
      return Promise.resolve({
        ok: put.ok,
        status: put.status ?? (put.ok ? 200 : 500),
        json: () => Promise.resolve(put.body ?? {}),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ saved_query_text: savedQuery }),
    } as Response);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function editAndSave(next: string) {
  const textarea = (await screen.findByLabelText(/describe the work you want to win/i)) as HTMLTextAreaElement;
  await waitFor(() => expect(textarea).not.toBeDisabled());
  fireEvent.change(textarea, { target: { value: next } });
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
}

describe("SavedQueryPage — save failures are rendered as errors (#185)", () => {
  it("renders a server-error save in a role=alert region, not the green success toast", async () => {
    mockFetch("old query text", { ok: false, status: 500 });
    render(<SavedQueryPage />);

    await editAndSave("new metal roofs on single-storey homes");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Save failed. Please try again.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders the 429 rate-limit message as an error, not the success toast", async () => {
    mockFetch("old query text", { ok: false, status: 429 });
    render(<SavedQueryPage />);

    await editAndSave("commercial waterproofing in inner Sydney");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/too many edits/i);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders a network error as an error, not the success toast", async () => {
    global.fetch = vi.fn((url: FetchArgs[0], init?: FetchArgs[1]) => {
      const u = String(url);
      if (u === "/api/account/saved-query" && init?.method === "PUT") {
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ saved_query_text: "old query text" }),
      } as Response);
    }) as unknown as typeof fetch;
    render(<SavedQueryPage />);

    await editAndSave("re-roofing and gutter replacement");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Network error. Please try again.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("still shows a successful save in the green polite success toast", async () => {
    mockFetch("old query text", { ok: true });
    render(<SavedQueryPage />);

    await editAndSave("new metal roofs on single-storey homes");

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/saved/i);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
