// Component test for the profile page (#166). Clearing the mobile field and
// saving must actually remove the number — send `null`, not undefined — and the
// green "Saved." toast must reflect the true post-save state (empty field).
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProfilePage from "./page";

type FetchArgs = Parameters<typeof fetch>;

let putBody: Record<string, unknown> | null = null;

/**
 * Mock GET /api/account/me with the given account, and echo PUT requests back
 * as the server would after honouring the write (so `mobile_e164: null` in the
 * request yields `mobile_e164: null` in the response).
 */
function mockFetch(me: { email?: string; mobile_e164?: string | null }) {
  putBody = null;
  global.fetch = vi.fn((url: FetchArgs[0], init?: FetchArgs[1]) => {
    const u = String(url);
    if (u === "/api/account/me" && (!init || init.method === undefined || init.method === "GET")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(me) } as Response);
    }
    if (u === "/api/account/me" && init?.method === "PUT") {
      putBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      // Server honours the removal: the persisted mobile is whatever was sent.
      const mobile_e164 = (putBody.mobile_e164 ?? null) as string | null;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...me, mobile_e164 }) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfilePage — clearing the mobile number", () => {
  it("sends mobile_e164: null when the field is emptied and saved (#166)", async () => {
    mockFetch({ email: "a@b.com", mobile_e164: "+61400000000" });
    render(<ProfilePage />);

    const input = (await screen.findByLabelText(/mobile number/i)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("+61400000000"));

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).toEqual({ mobile_e164: null });
  });

  it("keeps the field empty and shows Saved. after a successful removal (#166)", async () => {
    mockFetch({ email: "a@b.com", mobile_e164: "+61400000000" });
    render(<ProfilePage />);

    const input = (await screen.findByLabelText(/mobile number/i)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("+61400000000"));

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await screen.findByText("Saved.");
    // The input must not snap back to the old number — that was the false-success bug.
    expect(input.value).toBe("");
  });

  it("still sends a valid number unchanged when the field is filled", async () => {
    mockFetch({ email: "a@b.com", mobile_e164: null });
    render(<ProfilePage />);

    const input = (await screen.findByLabelText(/mobile number/i)) as HTMLInputElement;
    await waitFor(() => expect(input).not.toBeDisabled());

    fireEvent.change(input, { target: { value: "+61432346630" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).toEqual({ mobile_e164: "+61432346630" });
  });
});
