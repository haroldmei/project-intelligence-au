// Unit tests for billing/stripe.ts (signature validation + status mapping)
// FR-030 | NFR-015
import { describe, it, expect } from "vitest";
import {
  validateStripeWebhook,
  clampAccessUntil,
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
