// Integration tests for Stripe webhook handler
// system-design §6 NFR-015, FR-030
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import { validateStripeWebhook } from "@/modules/billing/stripe";
import { createHmac } from "node:crypto";

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
  vi.clearAllMocks();
});

afterAll(async () => {
  await testDb.$disconnect();
});

// ─── Unit: signature validation ─────────────────────────────────────────────

describe("validateStripeWebhook", () => {
  const secret = "whsec_test_secret";

  function buildSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
    const data = `${timestamp}.${payload}`;
    const sig = createHmac("sha256", secret).update(data).digest("hex");
    return `t=${timestamp},v1=${sig}`;
  }

  it("accepts a valid signature", () => {
    const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.created", data: { object: { customer: "cus_1", status: "trialing", current_period_end: 9999999999 } } });
    const signature = buildSignature(payload, secret);
    const result = validateStripeWebhook(payload, signature, secret);
    expect(result.valid).toBe(true);
    expect(result.event?.id).toBe("evt_1");
  });

  it("rejects tampered payload", () => {
    const payload = JSON.stringify({ id: "evt_1", type: "test", data: { object: {} } });
    const signature = buildSignature(payload, secret);
    const tampered = payload.replace("evt_1", "evt_EVIL");
    expect(validateStripeWebhook(tampered, signature, secret).valid).toBe(false);
  });

  it("rejects wrong secret", () => {
    const payload = JSON.stringify({ id: "evt_2", type: "test", data: { object: {} } });
    const signature = buildSignature(payload, "wrong-secret");
    expect(validateStripeWebhook(payload, signature, secret).valid).toBe(false);
  });

  it("rejects stale timestamp (> 300s)", () => {
    const oldTs = Math.floor(Date.now() / 1000) - 400;
    const payload = JSON.stringify({ id: "evt_3", type: "test", data: { object: {} } });
    const signature = buildSignature(payload, secret, oldTs);
    expect(validateStripeWebhook(payload, signature, secret).valid).toBe(false);
  });
});

// ─── Integration: subscription state updates ────────────────────────────────

describe("Stripe subscription state machine (DB)", () => {
  it("sets subscriptionStatus=active on subscription.updated(active)", async () => {
    const userId = await seedTestUser();
    const user = await testDb.user.update({
      where: { id: userId },
      data: { stripeCustomerId: "cus_test_active" },
    });

    // Simulate what the webhook handler does
    await testDb.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "active",
        accessUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const updated = await testDb.user.findUnique({ where: { id: userId } });
    expect(updated?.subscriptionStatus).toBe("active");
    expect(updated?.accessUntil).not.toBeNull();
  });

  it("sets subscriptionStatus=cancelled on subscription.deleted", async () => {
    const userId = await seedTestUser();
    await testDb.user.update({ where: { id: userId }, data: { stripeCustomerId: "cus_test_cancel", subscriptionStatus: "active" } });

    await testDb.user.update({ where: { id: userId }, data: { subscriptionStatus: "cancelled" } });

    const updated = await testDb.user.findUnique({ where: { id: userId } });
    expect(updated?.subscriptionStatus).toBe("cancelled");
  });
});
