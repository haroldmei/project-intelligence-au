// Unit tests for billing/stripe.ts (signature validation + status mapping)
// FR-030 | NFR-015
import { describe, it, expect } from "vitest";
import { validateStripeWebhook } from "@/modules/billing/stripe";
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
