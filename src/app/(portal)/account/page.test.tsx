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
    emailOptIn: true,
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
  // Reset the URL between tests — the page reads ?billing from window.location.
  window.history.pushState({}, "", "/account");
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

// The paid-conversion terminal hop (#133): a just-paid user redirected to
// /account?billing=success must NOT see the pre-checkout "Trial not started ·
// Choose a plan" while the async provisioning webhook is still in flight — they
// must see an explicit success confirmation and an "activating" state.
describe("AccountPage — post-Checkout ?billing=success (webhook race, #133)", () => {
  // Keep 'setTimeout' polling in the module in sync with this value.
  const POLL_INTERVAL_MS = 2500;

  it("shows a success confirmation and 'activating' state, not 'Choose a plan', while accessUntil is null", async () => {
    window.history.pushState({}, "", "/account?billing=success");
    // Pre-webhook DB state: schema default trial, accessUntil not yet populated.
    mockFetch(baseAccount({ subscriptionStatus: "trial", accessUntil: null }));
    render(<AccountPage />);

    // Explicit checkout-success confirmation.
    expect(await screen.findByText(/payment received/i)).toBeTruthy();
    // Provisioning state, not the pre-checkout dead-end.
    expect(screen.getByText(/activating your trial/i)).toBeTruthy();
    expect(screen.queryByText(/trial not started/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /choose a plan/i })).toBeNull();
  });

  it("stops showing 'activating' and reveals the trial-active state once the webhook lands (poll)", async () => {
    let call = 0;
    global.fetch = vi.fn((url: FetchArgs[0]) => {
      if (String(url) === "/api/account/me") {
        call += 1;
        // First load: webhook hasn't landed. A later poll: accessUntil populated.
        const acct =
          call === 1
            ? baseAccount({ subscriptionStatus: "trial", accessUntil: null })
            : baseAccount({ subscriptionStatus: "trial", accessUntil: "2026-08-01T00:00:00.000Z" });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(acct) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }) as unknown as typeof fetch;

    window.history.pushState({}, "", "/account?billing=success");
    render(<AccountPage />);

    // First load resolves — provisioning state.
    expect(await screen.findByText(/activating your trial/i)).toBeTruthy();

    // The scheduled poll (POLL_INTERVAL_MS) fires and the webhook has now landed;
    // wait past one interval for the page to flip itself to the trial-active state.
    expect(
      await screen.findByText(/trial ends/i, {}, { timeout: POLL_INTERVAL_MS + 2500 }),
    ).toBeTruthy();
    expect(screen.queryByText(/activating your trial/i)).toBeNull();
    // The confirmation banner persists after activation.
    expect(screen.getByText(/payment received/i)).toBeTruthy();
  }, 10_000);

  it("without ?billing, a pre-checkout trial user still sees 'Trial not started · Choose a plan'", async () => {
    // Regression guard: the provisioning UI must be gated on the ?billing hint,
    // not shown to every accessUntil-null trial user.
    mockFetch(baseAccount({ subscriptionStatus: "trial", accessUntil: null }));
    render(<AccountPage />);

    expect(await screen.findByText(/trial not started/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /choose a plan/i })).toBeTruthy();
    expect(screen.queryByText(/payment received/i)).toBeNull();
  });

  it("shows a neutral, no-charge note on ?billing=cancelled and still offers a plan", async () => {
    window.history.pushState({}, "", "/account?billing=cancelled");
    mockFetch(baseAccount({ subscriptionStatus: "trial", accessUntil: null }));
    render(<AccountPage />);

    expect(await screen.findByText(/weren't charged/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /choose a plan/i })).toBeTruthy();
    expect(screen.queryByText(/payment received/i)).toBeNull();
  });
});
