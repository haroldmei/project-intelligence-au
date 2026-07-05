// API-level integration test for the #132 fix: a past_due (dunning) subscriber
// must be able to cancel in-product. This exercises the REAL route + REAL
// getActiveSubscription + REAL cancelSubscriptionAtPeriodEnd against a mocked
// Stripe HTTP layer (global fetch) — the stripe module is deliberately NOT
// mocked, so the broadened status=all lookup is what makes the cancel succeed.
//
// Before the fix, getActiveSubscription queried only status=active/trialing, so
// this returned 404 'No active subscription found' and Stripe smart-retry later
// billed the card. This test pins 200 + cancel_at_period_end for a past_due user.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Auth: stub Lucia so the request is authenticated as our test user.
vi.mock("@/lib/auth/session", () => ({
  validateRequest: vi.fn(),
  serializeLuciaCookie: vi.fn(() => ""),
}));

// DB: in-memory stub — no Postgres needed. The route only reads the user's
// stripeCustomerId and (optionally) writes cancellationReason. Declared via
// vi.hoisted so the reference is available inside the hoisted vi.mock factory.
const dbUser = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(async () => ({})),
}));
vi.mock("@/lib/db", () => ({ db: { user: dbUser } }));

import { DELETE as cancelDELETE } from "@/app/api/billing/subscription/route";
import { validateRequest } from "@/lib/auth/session";

const USER_ID = "user_pastdue_1";
const CUSTOMER_ID = "cus_pastdue_1";
const SUB_ID = "sub_pastdue_1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateRequest).mockResolvedValue({
    user: { id: USER_ID },
    session: { id: "sess_1" },
  } as unknown as Awaited<ReturnType<typeof validateRequest>>);
  dbUser.findUnique.mockResolvedValue({ id: USER_ID, stripeCustomerId: CUSTOMER_ID });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Mock Stripe's HTTP layer: the subscription LIST returns a single past_due
 * subscription; the subscription UPDATE (cancel) echoes cancel_at_period_end.
 */
function stubStripe(): { fetchMock: ReturnType<typeof vi.fn>; periodEnd: number } {
  const periodEnd = 1_800_000_000; // fixed, inside the 400d access ceiling
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url.includes("/subscriptions?")) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: SUB_ID, status: "past_due", current_period_end: periodEnd, cancel_at_period_end: false },
          ],
        }),
      } as unknown as Response;
    }
    if (method === "POST" && url.includes(`/subscriptions/${SUB_ID}`)) {
      return {
        ok: true,
        json: async () => ({
          id: SUB_ID,
          status: "past_due",
          current_period_end: periodEnd,
          cancel_at_period_end: true,
        }),
      } as unknown as Response;
    }
    throw new Error(`unexpected Stripe call: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, periodEnd };
}

describe("DELETE /api/billing/subscription — past_due subscriber (#132)", () => {
  it("cancels a past_due subscription at period end (200, not 404)", async () => {
    const { fetchMock, periodEnd } = stubStripe();

    const req = new Request("http://localhost/api/billing/subscription", { method: "DELETE" });
    const res = await cancelDELETE(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.accessUntil).toBe(new Date(periodEnd * 1000).toISOString());

    // The Stripe cancel call was actually made against the past_due sub with
    // cancel_at_period_end=true (the whole point — it must not silently no-op).
    const cancelCall = fetchMock.mock.calls.find(
      ([url, init]) => (init as RequestInit)?.method === "POST" && String(url).includes(`/subscriptions/${SUB_ID}`),
    );
    expect(cancelCall).toBeDefined();
    expect(String((cancelCall![1] as RequestInit).body)).toContain("cancel_at_period_end=true");
  });
});
