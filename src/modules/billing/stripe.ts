// Stripe billing service — subscription create/cancel/reactivate.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// contract: payments.provider = stripe | payments.billing_region = au | payments.plans.solo = AUD 199/mo
// FR-018, FR-019, FR-021 | system-design §2 billing + §4 API
//
// ASSUMPTION: Stripe SDK is not yet in package.json. Using REST API via fetch.
// db-migrator request: no new schema changes — User already has stripeCustomerId, subscriptionStatus, accessUntil.
import { createHmac, timingSafeEqual } from "node:crypto";
import pino from "pino";
import { env } from "@/lib/env";

const log = pino({ name: "billing" });

const STRIPE_BASE = "https://api.stripe.com/v1";

// AUD pricing per contract.payments.plans. Optional in dev (env.ts gates them
// on prod); the placeholder strings below ensure type-stability without
// silently letting bad config reach Stripe.
export const PRICE_IDS: Record<string, string> = {
  solo: env.STRIPE_PRICE_ID_SOLO ?? "price_solo_placeholder",
  team: env.STRIPE_PRICE_ID_TEAM ?? "price_team_placeholder",
};

function getStripeKey(): string {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("[billing] STRIPE_SECRET_KEY not set — Stripe routes are dev-disabled");
  }
  return env.STRIPE_SECRET_KEY;
}

async function stripePost<T>(path: string, params: Record<string, string>): Promise<T> {
  const auth = Buffer.from(`${getStripeKey()}:`).toString("base64");
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Stripe error ${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

async function stripeGet<T>(path: string): Promise<T> {
  const auth = Buffer.from(`${getStripeKey()}:`).toString("base64");
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Stripe error ${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

export interface StripeCustomer {
  id: string;
  email: string;
}

/** Create or retrieve a Stripe customer for a user. */
export async function ensureStripeCustomer(userId: string, email: string, stripeCustomerId: string | null): Promise<string> {
  if (stripeCustomerId) return stripeCustomerId;

  const customer = await stripePost<StripeCustomer>("/customers", {
    email,
    "metadata[user_id]": userId,
  });
  log.info({ userId, customerId: customer.id }, "[billing] Stripe customer created");
  return customer.id;
}

export interface CheckoutSession {
  url: string;
  id: string;
}

/**
 * Create a Stripe Checkout session for subscription with 14-day trial.
 * AUD pricing; GST handled by Stripe Tax (NFR-029).
 * FR-018 | contract.payments.trial = 14-day full-access
 */
export async function createCheckoutSession(
  stripeCustomerId: string,
  plan: "solo" | "team",
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutSession> {
  const priceId = PRICE_IDS[plan];
  const session = await stripePost<{ url: string; id: string }>("/checkout/sessions", {
    customer: stripeCustomerId,
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "subscription_data[trial_period_days]": "14",
    // Stripe Tax for GST (NFR-029)
    "automatic_tax[enabled]": "true",
    currency: "aud",
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return { url: session.url, id: session.id };
}

/**
 * Create a Stripe Customer Portal session (cancel/upgrade).
 * FR-019 | system-design §2 billing
 */
export async function createBillingPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  return stripePost<{ url: string }>("/billing_portal/sessions", {
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
}

export interface StripeSubscription {
  id: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
}

/**
 * Fetch the first active or trialing subscription for a Stripe customer.
 * Returns null if the customer has no active subscription.
 * FR-021 | system-design §2 billing
 */
export async function getActiveSubscription(
  stripeCustomerId: string,
): Promise<StripeSubscription | null> {
  const data = await stripeGet<{
    data: StripeSubscription[];
  }>(`/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=active&limit=1`);
  if (data.data.length > 0) return data.data[0] ?? null;

  // Also check trialing subscriptions
  const trialing = await stripeGet<{ data: StripeSubscription[] }>(
    `/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=trialing&limit=1`,
  );
  return trialing.data[0] ?? null;
}

/**
 * Cancel a subscription at period end (no immediate revocation).
 * FR-021 | system-design §2 billing
 */
export async function cancelSubscriptionAtPeriodEnd(
  subscriptionId: string,
): Promise<StripeSubscription> {
  return stripePost<StripeSubscription>(`/subscriptions/${subscriptionId}`, {
    cancel_at_period_end: "true",
  });
}

/** Validate a Stripe webhook signature. Returns null on success, error message on failure. */
export function validateStripeWebhook(
  rawBody: string,
  signature: string,
  webhookSecret: string,
): { valid: boolean; event?: StripeEvent } {
  // Stripe signature: t=timestamp,v1=hmac
  const parts = signature.split(",").reduce((acc: Record<string, string>, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts["t"];
  const sigV1 = parts["v1"];
  if (!timestamp || !sigV1) return { valid: false };

  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", webhookSecret).update(payload).digest("hex");

  // Timing-safe comparison
  try {
    const match = timingSafeEqual(Buffer.from(expected), Buffer.from(sigV1));
    if (!match) return { valid: false };
  } catch {
    return { valid: false };
  }

  // Check timestamp freshness (300s tolerance)
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (age > 300) return { valid: false };

  try {
    const event = JSON.parse(rawBody) as StripeEvent;
    return { valid: true, event };
  } catch {
    return { valid: false };
  }
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}
