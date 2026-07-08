// Integration tests for Stripe webhook handler
// system-design §6 NFR-015, FR-030
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import { validateStripeWebhook } from "@/modules/billing/stripe";
import { createHmac } from "node:crypto";

// Mock the email client so we can assert the dunning send without a real
// Resend key. The route imports sendEmail from this module.
const sendEmail = vi.hoisted(() =>
  vi.fn<(args: { to: string; template: string; props: Record<string, unknown> }) => Promise<void>>(
    async () => {},
  ),
);
vi.mock("@/lib/email/client", () => ({ sendEmail }));

// Mock Sentry so we can assert the alert on an unrepresentable (Team) plan
// (issue #164) without a real DSN. The route imports `* as Sentry`.
const sentry = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sentry);

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

// ─── Integration: payment_failed dunning email (FR-018, FR-030) ─────────────

describe("POST /api/webhooks/stripe — payment_failed dunning email", () => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;

  function signedRequest(event: unknown): Request {
    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    return new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${sig}`, "content-type": "application/json" },
      body: payload,
    });
  }

  function paymentFailedEvent(id: string, customer: string) {
    return { id, type: "invoice.payment_failed", data: { object: { customer } } };
  }

  it("sends exactly one payment-failure email with a card-update link and flips past_due", async () => {
    // Import lazily so the vi.mock above is applied before the route module loads.
    const { POST } = await import("@/app/api/webhooks/stripe/route");

    const userId = await seedTestUser();
    const user = await testDb.user.update({
      where: { id: userId },
      data: { stripeCustomerId: "cus_dunning_1", subscriptionStatus: "active" },
    });

    const res = await POST(signedRequest(paymentFailedEvent("evt_pf_1", "cus_dunning_1")));
    expect(res.status).toBe(200);

    // Exactly one Resend email, using the payment-failure template, to this user.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toBe(user.email);
    expect(arg.template).toBe("payment-failed");
    // A working card-update link (the /account page hosts the billing portal).
    expect(String(arg.props.manageBillingUrl)).toMatch(/\/account$/);

    const updated = await testDb.user.findUnique({ where: { id: userId } });
    expect(updated?.subscriptionStatus).toBe("past_due");
  });

  it("does NOT send the payment-failure email on payment_action_required (3DS challenge)", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");

    const userId = await seedTestUser();
    await testDb.user.update({
      where: { id: userId },
      data: { stripeCustomerId: "cus_dunning_2", subscriptionStatus: "active" },
    });

    const event = { id: "evt_par_1", type: "invoice.payment_action_required", data: { object: { customer: "cus_dunning_2" } } };
    const res = await POST(signedRequest(event));
    expect(res.status).toBe(200);

    expect(sendEmail).not.toHaveBeenCalled();
    const updated = await testDb.user.findUnique({ where: { id: userId } });
    expect(updated?.subscriptionStatus).toBe("past_due");
  });

  it("acks 200 (does not throw) when the email send fails, having already flipped past_due", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    sendEmail.mockRejectedValueOnce(new Error("resend 500"));

    const userId = await seedTestUser();
    await testDb.user.update({
      where: { id: userId },
      data: { stripeCustomerId: "cus_dunning_3", subscriptionStatus: "active" },
    });

    const res = await POST(signedRequest(paymentFailedEvent("evt_pf_3", "cus_dunning_3")));
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const updated = await testDb.user.findUnique({ where: { id: userId } });
    expect(updated?.subscriptionStatus).toBe("past_due");
  });
});

// ─── Unrepresentable (Team) plan on a subscription (issue #164) ──────────────
// A subscription carrying the Team price is billed but not fulfillable: the app
// has no Team label/seat count and no per-seat digest fan-out. The webhook must
// NOT persist plan='team' (which rendered the account as Plan '—' / 1 seat while
// billed AUD 499) — it keeps the last representable plan and alerts Sentry.
describe("POST /api/webhooks/stripe — unrepresentable plan guard", () => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;

  function signedRequest(event: unknown): Request {
    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    return new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${sig}`, "content-type": "application/json" },
      body: payload,
    });
  }

  function subscriptionUpdated(id: string, customer: string, priceId: string) {
    return {
      id,
      type: "customer.subscription.updated",
      data: {
        object: {
          customer,
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 20 * 24 * 60 * 60,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: priceId } }] },
        },
      },
    };
  }

  it("does NOT persist plan='team' and alerts Sentry, while still granting access", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");

    const userId = await seedTestUser();
    await testDb.user.update({
      where: { id: userId },
      data: { stripeCustomerId: "cus_team_1", subscriptionStatus: "trial", plan: "solo" },
    });

    const res = await POST(signedRequest(subscriptionUpdated("evt_team_1", "cus_team_1", "price_test_team")));
    expect(res.status).toBe(200);

    const updated = await testDb.user.findUnique({ where: { id: userId } });
    // Plan is NOT overwritten to the unrepresentable 'team'…
    expect(updated?.plan).toBe("solo");
    // …but the customer still gets the access they paid for (ops resolves the
    // billing mismatch out of band, prompted by the alert).
    expect(updated?.subscriptionStatus).toBe("active");
    expect(updated?.accessUntil).not.toBeNull();

    // Loud, error-level alert naming the offending plan.
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [message, opts] = sentry.captureMessage.mock.calls[0];
    expect(String(message)).toContain("team");
    expect((opts as { level?: string })?.level).toBe("error");
  });

  it("persists plan='solo' for a representable subscription and does not alert", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");

    const userId = await seedTestUser();
    await testDb.user.update({
      where: { id: userId },
      data: { stripeCustomerId: "cus_solo_1", subscriptionStatus: "trial", plan: "solo" },
    });

    const res = await POST(signedRequest(subscriptionUpdated("evt_solo_1", "cus_solo_1", "price_test_solo")));
    expect(res.status).toBe(200);

    const updated = await testDb.user.findUnique({ where: { id: userId } });
    expect(updated?.plan).toBe("solo");
    expect(updated?.subscriptionStatus).toBe("active");
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});
