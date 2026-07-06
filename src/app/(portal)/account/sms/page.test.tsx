// Component test for the SMS opt-in page (#167). The no-mobile state must
// offer a one-tap path to add a mobile number, not dead-end the user.
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SMSOptInPage from "./page";

type FetchArgs = Parameters<typeof fetch>;

function mockFetch(me: { smsOptIn?: boolean; mobile_e164?: string | null; emailOptIn?: boolean }) {
  global.fetch = vi.fn((url: FetchArgs[0]) => {
    const u = String(url);
    if (u === "/api/account/me") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(me),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SMSOptInPage", () => {
  it("renders a link to /account/profile when the account has no mobile", async () => {
    mockFetch({ smsOptIn: false, mobile_e164: null });
    render(<SMSOptInPage />);

    const link = await screen.findByRole("link", { name: /add your mobile number/i });
    expect(link.getAttribute("href")).toBe("/account/profile");
  });

  it("keeps the toggle disabled while no mobile exists", async () => {
    mockFetch({ smsOptIn: false, mobile_e164: null });
    render(<SMSOptInPage />);

    const toggle = await screen.findByRole("switch", { name: /SMS digest/i });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(true));
  });

  it("does not show the add-mobile link once a mobile exists", async () => {
    mockFetch({ smsOptIn: false, mobile_e164: "+61400000000" });
    render(<SMSOptInPage />);

    const toggle = await screen.findByRole("switch", { name: /SMS digest/i });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("link", { name: /add your mobile number/i })).toBeNull();
  });
});

describe("SMSOptInPage — email digest re-enable control (#105)", () => {
  it("reflects an unsubscribed user with the email toggle off", async () => {
    mockFetch({ smsOptIn: false, mobile_e164: null, emailOptIn: false });
    render(<SMSOptInPage />);

    const emailToggle = await screen.findByRole("switch", { name: /email digest/i });
    await waitFor(() => expect(emailToggle.getAttribute("aria-checked")).toBe("false"));
    // The user is told they're cut off from the paid deliverable and can recover.
    expect(screen.getByText(/unsubscribed from the email digest/i)).toBeTruthy();
  });

  it("re-enables the email digest by POSTing to /api/account/email-opt-in", async () => {
    const posts: string[] = [];
    global.fetch = vi.fn((url: FetchArgs[0], init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/account/me") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ smsOptIn: false, mobile_e164: null, emailOptIn: false }),
        } as Response);
      }
      if (init?.method === "POST") posts.push(u);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }) as unknown as typeof fetch;
    render(<SMSOptInPage />);

    const emailToggle = await screen.findByRole("switch", { name: /email digest/i });
    await waitFor(() => expect(emailToggle.getAttribute("aria-checked")).toBe("false"));

    fireEvent.click(emailToggle);

    await waitFor(() => expect(posts).toContain("/api/account/email-opt-in"));
    expect(emailToggle.getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByRole("status")).toHaveTextContent("Email digest enabled.");
  });

  it("opts out via /api/account/email-opt-out when toggled off", async () => {
    const posts: string[] = [];
    global.fetch = vi.fn((url: FetchArgs[0], init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/account/me") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ smsOptIn: false, mobile_e164: null, emailOptIn: true }),
        } as Response);
      }
      if (init?.method === "POST") posts.push(u);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }) as unknown as typeof fetch;
    render(<SMSOptInPage />);

    const emailToggle = await screen.findByRole("switch", { name: /email digest/i });
    await waitFor(() => expect(emailToggle.getAttribute("aria-checked")).toBe("true"));

    fireEvent.click(emailToggle);

    await waitFor(() => expect(posts).toContain("/api/account/email-opt-out"));
  });

  it("reverts the optimistic flip and shows an alert when the re-enable POST fails", async () => {
    global.fetch = vi.fn((url: FetchArgs[0], init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/account/me") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ smsOptIn: false, mobile_e164: null, emailOptIn: false }),
        } as Response);
      }
      if (init?.method === "POST") {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }) as unknown as typeof fetch;
    render(<SMSOptInPage />);

    const emailToggle = await screen.findByRole("switch", { name: /email digest/i });
    await waitFor(() => expect(emailToggle.getAttribute("aria-checked")).toBe("false"));

    fireEvent.click(emailToggle);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to update. Please try again.");
    // Optimistic flip reverted.
    expect(emailToggle.getAttribute("aria-checked")).toBe("false");
  });
});

describe("SMSOptInPage — save failures are rendered as errors (#185)", () => {
  it("renders a failed opt-in in a role=alert region, not the green success toast", async () => {
    global.fetch = vi.fn((url: FetchArgs[0]) => {
      const u = String(url);
      if (u === "/api/account/me") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ smsOptIn: false, mobile_e164: "+61400000000" }),
        } as Response);
      }
      // POST /api/account/sms-opt-in fails
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
    }) as unknown as typeof fetch;
    render(<SMSOptInPage />);

    const toggle = await screen.findByRole("switch", { name: /SMS digest/i });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));

    fireEvent.click(toggle);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to update. Please try again.");
    expect(screen.queryByRole("status")).toBeNull();
    // Optimistic flip must have reverted on failure.
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});
