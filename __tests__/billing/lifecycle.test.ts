// Subscription lifecycle integration tests.
//
// Covers every state transition a user can go through:
//   pre-Checkout → trial → active → past_due → active → cancel-pending →
//   cancelled → resubscribe (no trial)
//
// Bypasses email verification entirely — users are seeded directly via
// Prisma with emailVerified=true so the suite is fully automated. The
// Stripe HTTP layer is mocked; webhook events are signed locally with the
// real HMAC scheme so signature validation runs end-to-end.

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "node:crypto";
import { truncateAll, seedLgaBundles, testDb } from "../setup-test-db";

// Env defaults are loaded by __tests__/setup-env.ts (vitest setupFiles) so
// every value env.ts validates on import is in place before module bodies run.
const TEST_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Replace the Stripe HTTP-calling helpers; keep validateStripeWebhook and
// planFromPriceId real so signature validation and price-lookup are exercised.
vi.mock("@/modules/billing/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/billing/stripe")>();
  return {
    ...actual,
    ensureStripeCustomer: vi.fn(async (userId: string, _email: string, existing: string | null) =>
      existing ?? `cus_test_${userId}`,
    ),
    createCheckoutSession: vi.fn(async () => ({ id: "cs_test", url: "https://checkout.stripe.com/test/stub" })),
    createBillingPortalSession: vi.fn(async () => ({ url: "https://billing.stripe.com/test/stub" })),
    getActiveSubscription: vi.fn(),
    cancelSubscriptionAtPeriodEnd: vi.fn(),
    reactivateSubscription: vi.fn(),
  };
});

// Auth: bypass Lucia by stubbing validateRequest to return the user we expect.
vi.mock("@/lib/auth/session", () => ({
  validateRequest: vi.fn(),
  serializeLuciaCookie: vi.fn(() => ""),
}));

// ─── Imports under test (must come AFTER vi.mock) ────────────────────────────
import { POST as webhookPOST } from "@/app/api/webhooks/stripe/route";
import { POST as checkoutPOST } from "@/app/api/billing/checkout/route";
import { DELETE as cancelDELETE, POST as reactivatePOST } from "@/app/api/billing/subscription/route";
import { POST as portalPOST } from "@/app/api/billing/portal/route";
import { GET as accountMeGET } from "@/app/api/account/me/route";
import { validateRequest } from "@/lib/auth/session";
import {
  createCheckoutSession,
  getActiveSubscription,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
} from "@/modules/billing/stripe";

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SeedOpts {
  email?: string;
  status?: string;
  stripeCustomerId?: string | null;
  accessUntil?: Date | null;
  cancelAtPeriodEnd?: boolean;
  plan?: string | null;
  emailVerified?: boolean;
}

async function seedUser(opts: SeedOpts = {}): Promise<string> {
  const user = await testDb.user.create({
    data: {
      email: opts.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      passwordHash: "hashed",
      emailVerified: opts.emailVerified ?? true,
      mobile_e164: "+61400000001",
      smsOptIn: false,
      trade: "roofing",
      subscriptionStatus: opts.status ?? "trial",
      stripeCustomerId: opts.stripeCustomerId ?? null,
      accessUntil: opts.accessUntil ?? null,
      cancelAtPeriodEnd: opts.cancelAtPeriodEnd ?? false,
      plan: opts.plan ?? null,
    },
  });
  return user.id;
}

function setAuthedUser(userId: string, email = "test@example.com"): void {
  vi.mocked(validateRequest).mockResolvedValue({
    user: {
      id: userId,
      email,
      emailVerified: true,
      subscriptionStatus: "trial",
      trade: "roofing",
    } as never,
    session: {
      id: "sess_test",
      userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      fresh: false,
    } as never,
  });
}

function clearAuth(): void {
  vi.mocked(validateRequest).mockResolvedValue(null);
}

interface StripeEventOpts {
  id?: string;
  type: string;
  customer: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: number;
  priceId?: string;
  invoiceLinesPeriodEnd?: number;
}

function buildEvent(opts: StripeEventOpts): { body: string; signature: string; eventId: string } {
  const eventId = opts.id ?? `evt_${Math.random().toString(36).slice(2, 12)}`;
  const baseObject: Record<string, unknown> = { customer: opts.customer };

  if (opts.type.startsWith("customer.subscription.")) {
    if (opts.status) baseObject.status = opts.status;
    if (opts.currentPeriodEnd) baseObject.current_period_end = opts.currentPeriodEnd;
    baseObject.cancel_at_period_end = opts.cancelAtPeriodEnd ?? false;
    if (opts.priceId) {
      baseObject.items = { data: [{ price: { id: opts.priceId } }] };
    }
  } else if (opts.type.startsWith("invoice.")) {
    if (opts.invoiceLinesPeriodEnd) {
      baseObject.lines = { data: [{ period: { end: opts.invoiceLinesPeriodEnd } }] };
    }
  }

  const body = JSON.stringify({ id: eventId, type: opts.type, data: { object: baseObject } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", TEST_WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex");
  return { body, signature: `t=${ts},v1=${sig}`, eventId };
}

async function deliverWebhook(opts: StripeEventOpts): Promise<{ status: number; eventId: string }> {
  const { body, signature, eventId } = buildEvent(opts);
  const req = new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body,
  });
  const res = await webhookPOST(req);
  return { status: res.status, eventId };
}

async function deliverWebhookRaw(body: string, signature: string): Promise<number> {
  const req = new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body,
  });
  return (await webhookPOST(req)).status;
}

async function callCheckout(plan: "solo" | "team" = "solo"): Promise<{ status: number; body: { checkout_url?: string; error?: string } }> {
  const req = new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  const res = await checkoutPOST(req);
  return { status: res.status, body: await res.json() };
}

async function callCancel(): Promise<{ status: number; body: { ok?: boolean; accessUntil?: string; error?: string } }> {
  const req = new Request("http://localhost/api/billing/subscription", { method: "DELETE" });
  const res = await cancelDELETE(req);
  return { status: res.status, body: await res.json() };
}

async function callReactivate(): Promise<{ status: number; body: { ok?: boolean; accessUntil?: string; error?: string } }> {
  const res = await reactivatePOST();
  return { status: res.status, body: await res.json() };
}

async function callPortal(): Promise<{ status: number; body: { portal_url?: string; error?: string } }> {
  const req = new Request("http://localhost/api/billing/portal", { method: "POST" });
  const res = await portalPOST(req);
  return { status: res.status, body: await res.json() };
}

async function callAccountMe(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await accountMeGET();
  return { status: res.status, body: await res.json() };
}

const ONE_HOUR = 60 * 60;
const FOURTEEN_DAYS = 14 * 24 * ONE_HOUR;
const ONE_MONTH = 30 * 24 * ONE_HOUR;
const NOW_S = () => Math.floor(Date.now() / 1000);

// ─── Lifecycle ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  await truncateAll();
  await seedLgaBundles();
});

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
  vi.clearAllMocks();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("Subscription lifecycle", () => {
  // ── 1. Pre-Checkout: signup state ──────────────────────────────────────────
  describe("Stage 1 — pre-Checkout", () => {
    it("seeded user starts with status=trial, no Stripe data", async () => {
      const userId = await seedUser();
      const user = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.subscriptionStatus).toBe("trial");
      expect(user.stripeCustomerId).toBeNull();
      expect(user.accessUntil).toBeNull();
      expect(user.cancelAtPeriodEnd).toBe(false);
      expect(user.plan).toBeNull();
    });

    it("GET /api/account/me reports trial-no-Stripe shape", async () => {
      const userId = await seedUser({ email: "premium-test@example.com" });
      setAuthedUser(userId);
      const { status, body } = await callAccountMe();
      expect(status).toBe(200);
      expect(body.subscriptionStatus).toBe("trial");
      expect(body.accessUntil).toBeNull();
      expect(body.cancelAtPeriodEnd).toBe(false);
      expect(body.plan).toBeNull();
    });

    it("DELETE /api/billing/subscription with no customer → 404", async () => {
      const userId = await seedUser();
      setAuthedUser(userId);
      const { status, body } = await callCancel();
      expect(status).toBe(404);
      expect(body.error).toMatch(/no.*subscription/i);
    });

    it("DELETE /api/billing/subscription unauthed → 401", async () => {
      clearAuth();
      const { status } = await callCancel();
      expect(status).toBe(401);
    });
  });

  // ── 2. Checkout creation ───────────────────────────────────────────────────
  describe("Stage 2 — checkout creation", () => {
    it("first-time checkout creates customer + caches stripeCustomerId, withTrial=true", async () => {
      const userId = await seedUser();
      setAuthedUser(userId);
      const { status, body } = await callCheckout("solo");
      expect(status).toBe(200);
      expect(body.checkout_url).toContain("checkout.stripe.com");
      const updated = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(updated.stripeCustomerId).toBe(`cus_test_${userId}`);
      expect(vi.mocked(createCheckoutSession)).toHaveBeenCalledWith(
        `cus_test_${userId}`,
        "solo",
        expect.stringContaining("/account?billing=success"),
        expect.stringContaining("/account?billing=cancelled"),
        { withTrial: true },
      );
    });

    it("re-subscriber (status=cancelled) checkout uses withTrial=false", async () => {
      const userId = await seedUser({ status: "cancelled", stripeCustomerId: "cus_existing" });
      setAuthedUser(userId);
      const { status } = await callCheckout("solo");
      expect(status).toBe(200);
      expect(vi.mocked(createCheckoutSession)).toHaveBeenCalledWith(
        "cus_existing",
        "solo",
        expect.any(String),
        expect.any(String),
        { withTrial: false },
      );
    });

    it("checkout unauthed → 401", async () => {
      clearAuth();
      const { status } = await callCheckout("solo");
      expect(status).toBe(401);
    });
  });

  // ── 3. Webhook: subscription.created (trial begins) ───────────────────────
  describe("Stage 3 — subscription.created", () => {
    it("populates plan, accessUntil, status=trial, cancelAtPeriodEnd=false", async () => {
      const userId = await seedUser({ stripeCustomerId: "cus_trial" });
      const periodEnd = NOW_S() + FOURTEEN_DAYS;
      const { status, eventId } = await deliverWebhook({
        type: "customer.subscription.created",
        customer: "cus_trial",
        status: "trialing",
        currentPeriodEnd: periodEnd,
        priceId: "price_test_solo",
      });
      expect(status).toBe(200);

      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.subscriptionStatus).toBe("trial");
      expect(u.plan).toBe("solo");
      expect(u.cancelAtPeriodEnd).toBe(false);
      expect(u.accessUntil!.getTime()).toBe(periodEnd * 1000);

      const evt = await testDb.stripeWebhookEvent.findUnique({ where: { id: eventId } });
      expect(evt).not.toBeNull();
    });

    it("idempotent: duplicate event id is a no-op", async () => {
      const userId = await seedUser({ stripeCustomerId: "cus_dup" });
      const evt = buildEvent({
        id: "evt_dup_fixed",
        type: "customer.subscription.created",
        customer: "cus_dup",
        status: "trialing",
        currentPeriodEnd: NOW_S() + FOURTEEN_DAYS,
        priceId: "price_test_solo",
      });
      // Deliver twice with the same body+signature
      expect(await deliverWebhookRaw(evt.body, evt.signature)).toBe(200);
      expect(await deliverWebhookRaw(evt.body, evt.signature)).toBe(200);

      // After first delivery the user has plan="solo"; re-set plan to a sentinel
      // and confirm the second delivery did NOT overwrite it.
      await testDb.user.update({ where: { id: userId }, data: { plan: "solo-sentinel" } });
      expect(await deliverWebhookRaw(evt.body, evt.signature)).toBe(200);
      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.plan).toBe("solo-sentinel");
    });

    it("unknown customer is acked but writes nothing", async () => {
      const userId = await seedUser({ stripeCustomerId: "cus_known" });
      const { status } = await deliverWebhook({
        type: "customer.subscription.created",
        customer: "cus_does_not_exist",
        status: "trialing",
        currentPeriodEnd: NOW_S() + FOURTEEN_DAYS,
        priceId: "price_test_solo",
      });
      expect(status).toBe(200);
      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.accessUntil).toBeNull();
    });

    it("invalid signature → 400", async () => {
      const status = await deliverWebhookRaw(
        JSON.stringify({ id: "evt_bad", type: "x", data: { object: {} } }),
        "t=1,v1=deadbeef",
      );
      expect(status).toBe(400);
    });

    it("missing signature header → 400", async () => {
      const req = new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" });
      const res = await webhookPOST(req);
      expect(res.status).toBe(400);
    });
  });

  // ── 4. Cancel mid-trial (cancel-at-period-end) ────────────────────────────
  describe("Stage 4 — cancel mid-trial", () => {
    it("DELETE returns ok + accessUntil; subsequent webhook persists cancel_at_period_end", async () => {
      const userId = await seedUser({
        stripeCustomerId: "cus_cancel",
        status: "trial",
        accessUntil: new Date(Date.now() + FOURTEEN_DAYS * 1000),
        plan: "solo",
      });
      setAuthedUser(userId);

      vi.mocked(getActiveSubscription).mockResolvedValue({
        id: "sub_cancel",
        status: "trialing",
        current_period_end: NOW_S() + FOURTEEN_DAYS,
        cancel_at_period_end: true,
      });
      vi.mocked(cancelSubscriptionAtPeriodEnd).mockResolvedValue({
        id: "sub_cancel",
        status: "trialing",
        current_period_end: NOW_S() + FOURTEEN_DAYS,
        cancel_at_period_end: true,
      });

      const { status, body } = await callCancel();
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.accessUntil).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Stripe then sends customer.subscription.updated with cancel_at_period_end=true
      await deliverWebhook({
        type: "customer.subscription.updated",
        customer: "cus_cancel",
        status: "trialing",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: NOW_S() + FOURTEEN_DAYS,
        priceId: "price_test_solo",
      });

      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.subscriptionStatus).toBe("trial");
      expect(u.cancelAtPeriodEnd).toBe(true);
    });

    // Issue #96 A5: the cancel dialog now collects a churn reason and the
    // DELETE handler persists it (was log-only before).
    it("persists a supplied cancellation reason (A5 churn signal)", async () => {
      const userId = await seedUser({
        stripeCustomerId: "cus_reason",
        status: "active",
        accessUntil: new Date(Date.now() + ONE_MONTH * 1000),
        plan: "solo",
      });
      setAuthedUser(userId);

      const sub = {
        id: "sub_reason",
        status: "active",
        current_period_end: NOW_S() + ONE_MONTH,
        cancel_at_period_end: true,
      };
      vi.mocked(getActiveSubscription).mockResolvedValue(sub);
      vi.mocked(cancelSubscriptionAtPeriodEnd).mockResolvedValue(sub);

      const req = new Request("http://localhost/api/billing/subscription", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "not_enough_leads" }),
      });
      const res = await cancelDELETE(req);
      expect(res.status).toBe(200);

      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.cancellationReason).toBe("not_enough_leads");
    });

    it("rejects an out-of-enum reason but still cancels (reason left null)", async () => {
      const userId = await seedUser({
        stripeCustomerId: "cus_badreason",
        status: "active",
        accessUntil: new Date(Date.now() + ONE_MONTH * 1000),
        plan: "solo",
      });
      setAuthedUser(userId);

      const sub = {
        id: "sub_badreason",
        status: "active",
        current_period_end: NOW_S() + ONE_MONTH,
        cancel_at_period_end: true,
      };
      vi.mocked(getActiveSubscription).mockResolvedValue(sub);
      vi.mocked(cancelSubscriptionAtPeriodEnd).mockResolvedValue(sub);

      const req = new Request("http://localhost/api/billing/subscription", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "i-hate-it" }),
      });
      const res = await cancelDELETE(req);
      expect(res.status).toBe(200); // cancel still succeeds

      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.cancellationReason).toBeNull();
    });
  });

  // ── 4b. Reactivate a pending cancellation (in-product Undo) ────────────────
  describe("Stage 4b — reactivate pending cancellation", () => {
    it("POST returns ok + accessUntil; subsequent webhook clears cancel_at_period_end", async () => {
      const userId = await seedUser({
        stripeCustomerId: "cus_reactivate",
        status: "active",
        accessUntil: new Date(Date.now() + ONE_MONTH * 1000),
        plan: "solo",
        cancelAtPeriodEnd: true,
      });
      setAuthedUser(userId);

      // Pending-cancellation subs are still active, so getActiveSubscription
      // returns it (with cancel_at_period_end still true).
      vi.mocked(getActiveSubscription).mockResolvedValue({
        id: "sub_reactivate",
        status: "active",
        current_period_end: NOW_S() + ONE_MONTH,
        cancel_at_period_end: true,
      });
      vi.mocked(reactivateSubscription).mockResolvedValue({
        id: "sub_reactivate",
        status: "active",
        current_period_end: NOW_S() + ONE_MONTH,
        cancel_at_period_end: false,
      });

      const { status, body } = await callReactivate();
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.accessUntil).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(reactivateSubscription).toHaveBeenCalledWith("sub_reactivate");

      // Stripe then sends customer.subscription.updated with cancel_at_period_end=false
      await deliverWebhook({
        type: "customer.subscription.updated",
        customer: "cus_reactivate",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: NOW_S() + ONE_MONTH,
        priceId: "price_test_solo",
      });

      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.subscriptionStatus).toBe("active");
      expect(u.cancelAtPeriodEnd).toBe(false);
    });

    it("POST with no customer → 404", async () => {
      const userId = await seedUser();
      setAuthedUser(userId);
      const { status } = await callReactivate();
      expect(status).toBe(404);
    });

    it("POST with no active subscription → 404", async () => {
      const userId = await seedUser({ stripeCustomerId: "cus_none", status: "active", plan: "solo" });
      setAuthedUser(userId);
      vi.mocked(getActiveSubscription).mockResolvedValue(null);
      const { status } = await callReactivate();
      expect(status).toBe(404);
      expect(reactivateSubscription).not.toHaveBeenCalled();
    });

    it("POST unauthenticated → 401", async () => {
      clearAuth();
      const { status } = await callReactivate();
      expect(status).toBe(401);
    });
  });

  // ── 5. Trial → paid (auto-conversion at trial end) ────────────────────────
  describe("Stage 5 — trial converts to paid", () => {
    it("subscription.updated(active) flips status from trial to active", async () => {
      const userId = await seedUser({
        stripeCustomerId: "cus_convert",
        status: "trial",
        plan: "solo",
        accessUntil: new Date(Date.now() + FOURTEEN_DAYS * 1000),
      });
      const newPeriodEnd = NOW_S() + ONE_MONTH;
      await deliverWebhook({
        type: "customer.subscription.updated",
        customer: "cus_convert",
        status: "active",
        currentPeriodEnd: newPeriodEnd,
        priceId: "price_test_solo",
      });
      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.subscriptionStatus).toBe("active");
      expect(u.accessUntil!.getTime()).toBe(newPeriodEnd * 1000);
    });
  });

  // ── 6. Past-due → recovery loop ───────────────────────────────────────────
  describe("Stage 6 — payment failure & recovery", () => {
    it("invoice.payment_failed sets status=past_due", async () => {
      const userId = await seedUser({ stripeCustomerId: "cus_pd", status: "active", plan: "solo" });
      await deliverWebhook({ type: "invoice.payment_failed", customer: "cus_pd" });
      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.subscriptionStatus).toBe("past_due");
    });

    it("invoice.payment_succeeded while past_due → status=active + accessUntil bumped", async () => {
      const userId = await seedUser({ stripeCustomerId: "cus_recover", status: "past_due", plan: "solo" });
      const newEnd = NOW_S() + ONE_MONTH;
      await deliverWebhook({
        type: "invoice.payment_succeeded",
        customer: "cus_recover",
        invoiceLinesPeriodEnd: newEnd,
      });
      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.subscriptionStatus).toBe("active");
      expect(u.accessUntil!.getTime()).toBe(newEnd * 1000);
    });

    it("invoice.payment_succeeded while already active → no state change", async () => {
      const before = new Date(Date.now() + ONE_MONTH * 1000);
      const userId = await seedUser({
        stripeCustomerId: "cus_already",
        status: "active",
        plan: "solo",
        accessUntil: before,
      });
      await deliverWebhook({
        type: "invoice.payment_succeeded",
        customer: "cus_already",
        invoiceLinesPeriodEnd: NOW_S() + ONE_MONTH * 2,
      });
      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.subscriptionStatus).toBe("active");
      expect(u.accessUntil!.toISOString()).toBe(before.toISOString());
    });
  });

  // ── 7. Period end → cancelled ─────────────────────────────────────────────
  describe("Stage 7 — final cancellation", () => {
    it("subscription.deleted sets status=cancelled, clears cancel-pending flag", async () => {
      const userId = await seedUser({
        stripeCustomerId: "cus_gone",
        status: "active",
        plan: "solo",
        cancelAtPeriodEnd: true,
      });
      await deliverWebhook({ type: "customer.subscription.deleted", customer: "cus_gone" });
      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.subscriptionStatus).toBe("cancelled");
      expect(u.cancelAtPeriodEnd).toBe(false);
    });
  });

  // ── 8. Resubscribe ────────────────────────────────────────────────────────
  describe("Stage 8 — resubscribe", () => {
    it("cancelled user → checkout reuses customer, withTrial=false, then subscription.created restores access", async () => {
      const userId = await seedUser({
        stripeCustomerId: "cus_resub",
        status: "cancelled",
        plan: "solo",
        accessUntil: new Date(Date.now() - 1000),
      });
      setAuthedUser(userId);
      const { status } = await callCheckout("solo");
      expect(status).toBe(200);
      expect(vi.mocked(createCheckoutSession)).toHaveBeenCalledWith(
        "cus_resub",
        "solo",
        expect.any(String),
        expect.any(String),
        { withTrial: false },
      );

      const newEnd = NOW_S() + ONE_MONTH;
      await deliverWebhook({
        type: "customer.subscription.created",
        customer: "cus_resub",
        status: "active",
        currentPeriodEnd: newEnd,
        priceId: "price_test_solo",
      });
      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.subscriptionStatus).toBe("active");
      expect(u.accessUntil!.getTime()).toBe(newEnd * 1000);
    });
  });

  // ── 9. mapStripeStatus safety: unknown statuses don't downgrade ───────────
  describe("Stage 9 — defensive status mapping", () => {
    it("unknown Stripe status preserves current DB status (no silent downgrade)", async () => {
      const userId = await seedUser({ stripeCustomerId: "cus_unknown", status: "active", plan: "solo" });
      await deliverWebhook({
        type: "customer.subscription.updated",
        customer: "cus_unknown",
        status: "incomplete",
        currentPeriodEnd: NOW_S() + ONE_HOUR,
        priceId: "price_test_solo",
      });
      const u = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
      expect(u.subscriptionStatus).toBe("active");
    });
  });

  // ── 10. Portal ────────────────────────────────────────────────────────────
  describe("Stage 10 — billing portal", () => {
    it("returns a portal URL when customer exists", async () => {
      const userId = await seedUser({ stripeCustomerId: "cus_portal", status: "active", plan: "solo" });
      setAuthedUser(userId);
      const { status, body } = await callPortal();
      expect(status).toBe(200);
      expect(body.portal_url).toContain("billing.stripe.com");
    });

    it("returns 404 when user has no Stripe customer", async () => {
      const userId = await seedUser();
      setAuthedUser(userId);
      const { status } = await callPortal();
      expect(status).toBe(404);
    });
  });
});
