// Unit tests for billing/stripe.ts (signature validation + status mapping)
// FR-030 | NFR-015
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  validateStripeWebhook,
  clampAccessUntil,
  getActiveSubscription,
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
