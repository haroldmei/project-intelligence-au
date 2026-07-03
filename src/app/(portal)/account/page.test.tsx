// Component test for the account Subscription section (#107): in the past_due
// dunning state, recovery ("Update your card" → Stripe portal) must be the
// leading action, not the buried "Cancel subscription" link.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AccountPage from "./page";
import type { AccountDTO } from "@/modules/account/service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

type FetchArgs = Parameters<typeof fetch>;

function baseAccount(overrides: Partial<AccountDTO> = {}): AccountDTO {
  return {
    id: "u1",
    email: "tradie@example.com",
    mobile_e164: null,
    emailVerified: true,
    smsOptIn: false,
    stormBriefOptIn: false,
    trade: "roofing",
    subscriptionStatus: "active",
    accessUntil: "2026-08-01T00:00:00.000Z",
    plan: "solo",
    cancelAtPeriodEnd: false,
    savedQueryText: "roof leaks",
    lgaBundles: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockFetch(account: AccountDTO) {
  const calls: { url: string; init?: RequestInit }[] = [];
  global.fetch = vi.fn((url: FetchArgs[0], init?: FetchArgs[1]) => {
    const u = String(url);
    calls.push({ url: u, init: init as RequestInit });
    if (u === "/api/account/me") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(account),
      } as Response);
    }
    if (u === "/api/billing/portal") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ portal_url: "https://billing.stripe.test/session" }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AccountPage — past_due dunning state", () => {
  it("leads with a primary 'Update your card' button, not the Cancel link", async () => {
    mockFetch(baseAccount({ subscriptionStatus: "past_due" }));
    render(<AccountPage />);

    const updateBtn = await screen.findByRole("button", { name: /update your card/i });
    // Primary (amber, Button-styled) affordance.
    expect(updateBtn.className).toContain("bg-[#D97706]");

    const cancelBtn = screen.getByRole("button", { name: /cancel subscription/i });
    // Cancel is demoted to a plain underlined link, not a button-styled CTA.
    expect(cancelBtn.className).toContain("underline");
    expect(cancelBtn.className).not.toContain("bg-[#D97706]");

    // The recovery CTA precedes the cancel action in the DOM.
    expect(
      updateBtn.compareDocumentPosition(cancelBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens the Stripe billing portal when 'Update your card' is clicked", async () => {
    const calls = mockFetch(baseAccount({ subscriptionStatus: "past_due" }));
    render(<AccountPage />);

    const updateBtn = await screen.findByRole("button", { name: /update your card/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      const portal = calls.find((c) => c.url === "/api/billing/portal");
      expect(portal).toBeTruthy();
      expect(portal!.init?.method).toBe("POST");
    });
  });

  it("explains that access resumes once payment succeeds", async () => {
    mockFetch(baseAccount({ subscriptionStatus: "past_due" }));
    render(<AccountPage />);
    await screen.findByRole("button", { name: /update your card/i });
    expect(screen.getByText(/access resumes as soon as it clears/i)).toBeTruthy();
  });

  it("does not render a primary 'Update your card' CTA when the subscription is active", async () => {
    mockFetch(baseAccount({ subscriptionStatus: "active" }));
    render(<AccountPage />);
    // The active state leads with Cancel + Manage billing, no card-update CTA.
    await screen.findByRole("button", { name: /cancel subscription/i });
    expect(screen.queryByRole("button", { name: /update your card/i })).toBeNull();
  });
});
