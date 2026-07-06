// Unit tests for billing/stripe.ts (signature validation + status mapping)
// FR-030 | NFR-015
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  validateStripeWebhook,
  clampAccessUntil,
  createCheckoutSession,
  getActiveSubscription,
  planFromPriceId,
  isRepresentablePlan,
  REPRESENTABLE_PLANS,
  MAX_ACCESS_DAYS,
} from "@/modules/billing/stripe";
import { createHmac } from "node:crypto";

function buildStripeSignature(payload: string, secret: string, ts = Math.floor(Date.now() / 1000)): string {
  const data = `${ts}.${payload}`;
  const sig = createHmac("sha256", secret).update(data).digest("hex");
  return `t=${ts},v1=${sig}`;
}

describe("validateStripeWebhook", () => {
  const secret = "whsec_test_32charslongsecretkey123";

  it("validates correct signature", () => {
    const payload = JSON.stringify({ id: "evt_ok", type: "customer.subscription.updated", data: { object: { customer: "cus_1", status: "active", current_period_end: 9999999999 } } });
    const sig = buildStripeSignature(payload, secret);
    const { valid, event } = validateStripeWebhook(payload, sig, secret);
    expect(valid).toBe(true);
    expect(event?.type).toBe("customer.subscription.updated");
  });

  it("rejects tampered payload", () => {
    const payload = JSON.stringify({ id: "evt_orig", type: "test", data: { object: {} } });
    const sig = buildStripeSignature(payload, secret);
    const { valid } = validateStripeWebhook(payload + "x", sig, secret);
    expect(valid).toBe(false);
  });

  it("rejects wrong secret", () => {
    const payload = JSON.stringify({ id: "evt_2", type: "test", data: { object: {} } });
    const sig = buildStripeSignature(payload, "wrong");
    expect(validateStripeWebhook(payload, sig, secret).valid).toBe(false);
  });

  it("rejects stale timestamp", () => {
    const staleTs = Math.floor(Date.now() / 1000) - 400;
    const payload = JSON.stringify({ id: "evt_stale", type: "test", data: { object: {} } });
    const sig = buildStripeSignature(payload, secret, staleTs);
    expect(validateStripeWebhook(payload, sig, secret).valid).toBe(false);
  });

  it("rejects missing v1 component", () => {
    const payload = "{}";
    expect(validateStripeWebhook(payload, "t=123", secret).valid).toBe(false);
  });
});

// ─── accessUntil clamp (adversarial G-007) ──────────────────────────────────
// A crafted/buggy webhook `current_period_end` must not grant unbounded access
// or revoke a paid-up user early. Result is pinned to [now, now + 400d].
describe("clampAccessUntil", () => {
  const now = new Date("2026-07-03T00:00:00.000Z");
  const nowSec = Math.floor(now.getTime() / 1000);
  const ceiling = new Date(now.getTime() + MAX_ACCESS_DAYS * 86_400_000);

  it("passes a normal one-month period end through untouched", () => {
    const periodEnd = nowSec + 30 * 86_400;
    const { accessUntil, clamped } = clampAccessUntil(periodEnd, now);
    expect(clamped).toBe("none");
    expect(accessUntil.getTime()).toBe(periodEnd * 1000);
  });

  it("passes an annual prepay (365d) through — inside the 400d ceiling", () => {
    const periodEnd = nowSec + 365 * 86_400;
    const { accessUntil, clamped } = clampAccessUntil(periodEnd, now);
    expect(clamped).toBe("none");
    expect(accessUntil.getTime()).toBe(periodEnd * 1000);
  });

  it("caps an absurd far-future period end (year 33658) at the ceiling", () => {
    // The G-007 attack payload: a huge current_period_end → unbounded access.
    const { accessUntil, clamped } = clampAccessUntil(999_999_999_999, now);
    expect(clamped).toBe("ceiling");
    expect(accessUntil.getTime()).toBe(ceiling.getTime());
    expect(accessUntil.getUTCFullYear()).toBeLessThan(2028);
  });

  it("caps a value just past the 400d ceiling", () => {
    const periodEnd = nowSec + (MAX_ACCESS_DAYS + 1) * 86_400;
    const { accessUntil, clamped } = clampAccessUntil(periodEnd, now);
    expect(clamped).toBe("ceiling");
    expect(accessUntil.getTime()).toBe(ceiling.getTime());
  });

  it("floors a past period end to now (no 1970 access loss)", () => {
    const { accessUntil, clamped } = clampAccessUntil(nowSec - 30 * 86_400, now);
    expect(clamped).toBe("floor");
    expect(accessUntil.getTime()).toBe(now.getTime());
  });

  it("floors 0 (the epoch/1970 payload) to now", () => {
    const { accessUntil, clamped } = clampAccessUntil(0, now);
    expect(clamped).toBe("invalid");
    expect(accessUntil.getTime()).toBe(now.getTime());
  });

  it.each([undefined, null, NaN, Infinity, -Infinity, -100])(
    "floors missing/non-finite period end (%p) to now",
    (bad) => {
      const { accessUntil, clamped } = clampAccessUntil(bad as number, now);
      expect(clamped).toBe("invalid");
      expect(accessUntil.getTime()).toBe(now.getTime());
    },
  );

  it("treats exactly now as within bounds", () => {
    const { accessUntil, clamped } = clampAccessUntil(nowSec, now);
    expect(clamped).toBe("none");
    expect(accessUntil.getTime()).toBe(nowSec * 1000);
  });
});

// ─── createCheckoutSession: one signup-anchored trial (issue #198) ──────────
// The product grants a SINGLE 28-day trial that starts at signup. A mid-trial
// converter must get only the remainder of that window, so the session anchors
// Stripe to an absolute trial_end (signup+28d) rather than a rolling
// trial_period_days that would hand out a fresh 28 days. A deadline Stripe won't
// accept (<48h out, or already elapsed) and an absent deadline (cancelled
// re-subscriber) both fall back to no trial → charged immediately.
describe("createCheckoutSession — signup-anchored trial", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubCheckoutFetch(): URLSearchParams[] {
    const bodies: URLSearchParams[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        bodies.push(new URLSearchParams(init?.body ?? ""));
        return {
          ok: true,
          json: async () => ({ id: "cs_test", url: "https://checkout.stripe.com/test" }),
        } as unknown as Response;
      }),
    );
    return bodies;
  }

  it("anchors an absolute trial_end (not a rolling trial_period_days) for a future deadline", async () => {
    const bodies = stubCheckoutFetch();
    const trialEndsAt = new Date(Date.now() + 8 * 86_400_000); // 8 days out (≈ day-20 converter)
    await createCheckoutSession("cus_1", "solo", "https://s", "https://c", { trialEndsAt });
    expect(bodies[0]!.get("subscription_data[trial_end]")).toBe(
      String(Math.floor(trialEndsAt.getTime() / 1000)),
    );
    expect(bodies[0]!.get("subscription_data[trial_period_days]")).toBeNull();
  });

  it("omits the trial entirely when no trialEndsAt is given (cancelled re-subscriber → charged now)", async () => {
    const bodies = stubCheckoutFetch();
    await createCheckoutSession("cus_2", "solo", "https://s", "https://c", {});
    expect(bodies[0]!.get("subscription_data[trial_end]")).toBeNull();
    expect(bodies[0]!.get("subscription_data[trial_period_days]")).toBeNull();
  });

  it("drops a deadline inside Stripe's 48h minimum (near-end converter → charged now)", async () => {
    const bodies = stubCheckoutFetch();
    const trialEndsAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h out
    await createCheckoutSession("cus_3", "solo", "https://s", "https://c", { trialEndsAt });
    expect(bodies[0]!.get("subscription_data[trial_end]")).toBeNull();
    expect(bodies[0]!.get("subscription_data[trial_period_days]")).toBeNull();
  });

  it("drops an already-elapsed signup window (past-window trialer → charged now)", async () => {
    const bodies = stubCheckoutFetch();
    const trialEndsAt = new Date(Date.now() - 86_400_000); // yesterday
    await createCheckoutSession("cus_4", "solo", "https://s", "https://c", { trialEndsAt });
    expect(bodies[0]!.get("subscription_data[trial_end]")).toBeNull();
  });
});

// ─── getActiveSubscription: dunning subscribers stay cancellable (issue #132) ─
// past_due/unpaid/paused subscriptions are kept LIVE by the entitlement module
// (#106) — a card-failing subscriber is still cancelling-eligible. The old
// status=active/trialing-only lookup hid them, so cancel/reactivate/erasure
// returned null → 404 and Stripe smart-retry later billed AUD 99. These pin the
// broadened lookup: any live/cancellable status is returned, canceled is not.
describe("getActiveSubscription", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cus = "cus_dunning_1";

  // Emulates real Stripe's status filtering: a status=all query returns every
  // subscription, but status=active/trialing (the pre-fix query) returns only
  // subscriptions matching that exact status. Without this filtering the mock
  // would return the same data regardless of the query and could pass against
  // the pre-fix status=active/trialing-only lookup.
  function stubStripeList(subs: Array<{ id: string; status: string }>): () => string[] {
    const calledUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calledUrls.push(url);
        const status = new URL(url, "http://stripe.local").searchParams.get("status");
        const filtered = status && status !== "all" ? subs.filter((s) => s.status === status) : subs;
        const data = filtered.map((s) => ({
          id: s.id,
          status: s.status,
          current_period_end: 9_999_999_999,
          cancel_at_period_end: false,
        }));
        return { ok: true, json: async () => ({ data }) } as unknown as Response;
      }),
    );
    return () => calledUrls;
  }

  it("returns a past_due subscription (the #132 regression)", async () => {
    stubStripeList([{ id: "sub_pd", status: "past_due" }]);
    const sub = await getActiveSubscription(cus);
    expect(sub).not.toBeNull();
    expect(sub?.id).toBe("sub_pd");
    expect(sub?.status).toBe("past_due");
  });

  it.each(["unpaid", "paused"])("returns a %s subscription (also cancellable)", async (status) => {
    stubStripeList([{ id: `sub_${status}`, status }]);
    const sub = await getActiveSubscription(cus);
    expect(sub?.id).toBe(`sub_${status}`);
  });

  it("queries status=all so dunning subs are not filtered out by Stripe", async () => {
    const urls = stubStripeList([{ id: "sub_pd", status: "past_due" }]);
    await getActiveSubscription(cus);
    expect(urls().some((u) => u.includes("status=all"))).toBe(true);
    // Must not fall back to a status=active-only query that would hide past_due.
    expect(urls().every((u) => !u.includes("status=active"))).toBe(true);
  });

  it("prefers an active subscription over a dunning one when both exist", async () => {
    stubStripeList([
      { id: "sub_pd", status: "past_due" },
      { id: "sub_active", status: "active" },
    ]);
    const sub = await getActiveSubscription(cus);
    expect(sub?.id).toBe("sub_active");
  });

  it("returns null when the only subscription is already canceled", async () => {
    stubStripeList([{ id: "sub_x", status: "canceled" }]);
    expect(await getActiveSubscription(cus)).toBeNull();
  });

  it("returns null when the customer has no subscriptions", async () => {
    stubStripeList([]);
    expect(await getActiveSubscription(cus)).toBeNull();
  });
});

// ─── Plan representability (issue #164) ─────────────────────────────────────
// The Team price exists in Stripe config (STRIPE_PRICE_ID_TEAM), so the webhook
// can receive it — but the app can't represent or serve Team yet. isRepresentable
// gates what the webhook is allowed to persist onto a user, so a Team price can
// never render the account as Plan '—' / 1 seat while billed AUD 499.
describe("plan representability", () => {
  it("maps the configured price ids back to plan names", () => {
    expect(planFromPriceId("price_test_solo")).toBe("solo");
    expect(planFromPriceId("price_test_team")).toBe("team");
    expect(planFromPriceId("price_unknown")).toBeUndefined();
  });

  it("treats solo as representable and team as not (multi-seat is deferred)", () => {
    expect(isRepresentablePlan("solo")).toBe(true);
    expect(isRepresentablePlan("team")).toBe(false);
    expect(isRepresentablePlan("enterprise")).toBe(false);
  });

  it("REPRESENTABLE_PLANS contains only solo", () => {
    expect([...REPRESENTABLE_PLANS]).toEqual(["solo"]);
  });
});

// ─── Billing portal: no plan switching (issue #164) ─────────────────────────
// The portal is labelled cancel/upgrade, but the app can't represent Team, so
// the session is bound to a configuration with subscription_update disabled —
// a Solo subscriber can update cards / cancel but can't self-serve onto the
// unrepresentable Team price. If the configuration can't be created, we fall
// back to a default session rather than break billing management.
describe("createBillingPortalSession — plan switching disabled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  type Recorded = { url: string; body: URLSearchParams };

  function stubPortalFetch(configResponse: { ok: boolean; id?: string }): Recorded[] {
    const calls: Recorded[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: string }) => {
        calls.push({ url, body: new URLSearchParams(init?.body ?? "") });
        if (url.includes("/billing_portal/configurations")) {
          if (!configResponse.ok) {
            return { ok: false, status: 400, text: async () => "no business profile" } as unknown as Response;
          }
          return { ok: true, json: async () => ({ id: configResponse.id }) } as unknown as Response;
        }
        // billing_portal/sessions
        return { ok: true, json: async () => ({ url: "https://billing.stripe.test/session" }) } as unknown as Response;
      }),
    );
    return calls;
  }

  it("creates a configuration with subscription_update disabled and binds the session to it", async () => {
    // Fresh module so the process-level config cache starts empty.
    vi.resetModules();
    const calls = stubPortalFetch({ ok: true, id: "bpc_locked_1" });
    const { createBillingPortalSession } = await import("@/modules/billing/stripe");

    const result = await createBillingPortalSession("cus_portal_1", "https://app.test/account");
    expect(result.url).toBe("https://billing.stripe.test/session");

    const configCall = calls.find((c) => c.url.includes("/billing_portal/configurations"));
    expect(configCall).toBeDefined();
    expect(configCall!.body.get("features[subscription_update][enabled]")).toBe("false");
    // Cancel / card update / invoices stay available — only plan switching is off.
    expect(configCall!.body.get("features[subscription_cancel][enabled]")).toBe("true");
    expect(configCall!.body.get("features[payment_method_update][enabled]")).toBe("true");

    const sessionCall = calls.find((c) => c.url.includes("/billing_portal/sessions"));
    expect(sessionCall).toBeDefined();
    expect(sessionCall!.body.get("configuration")).toBe("bpc_locked_1");
    expect(sessionCall!.body.get("customer")).toBe("cus_portal_1");
  });

  it("falls back to a default (unbound) session if the configuration can't be created", async () => {
    vi.resetModules();
    const calls = stubPortalFetch({ ok: false });
    const { createBillingPortalSession } = await import("@/modules/billing/stripe");

    const result = await createBillingPortalSession("cus_portal_2", "https://app.test/account");
    // Managing billing must still work even when the lock config fails.
    expect(result.url).toBe("https://billing.stripe.test/session");

    const sessionCall = calls.find((c) => c.url.includes("/billing_portal/sessions"));
    expect(sessionCall).toBeDefined();
    expect(sessionCall!.body.get("configuration")).toBeNull();
  });
});
