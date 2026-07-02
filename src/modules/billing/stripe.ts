// Stripe billing service — subscription create/cancel/reactivate.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// contract: payments.provider = stripe | payments.billing_region = au | payments.plans.solo = AUD 99/mo inc GST
// Price is the single source of truth in src/lib/pricing.ts — the actual amount
// charged lives in the Stripe Price object (STRIPE_PRICE_ID_SOLO); the module
// values are echoed into checkout metadata for reconciliation, never re-charged.
// FR-018, FR-019, FR-021 | system-design §2 billing + §4 API
//
// ASSUMPTION: Stripe SDK is not yet in package.json. Using REST API via fetch.
// db-migrator request: no new schema changes — User already has stripeCustomerId, subscriptionStatus, accessUntil.
import { createHmac, timingSafeEqual } from "node:crypto";
import pino from "pino";
import { env } from "@/lib/env";
import { PRICING } from "@/lib/pricing";

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

async function stripePost<T>(
  path: string,
  params: Record<string, string>,
  opts: { idempotencyKey?: string } = {},
): Promise<T> {
  const auth = Buffer.from(`${getStripeKey()}:`).toString("base64");
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: "POST",
    headers,
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

  // Idempotency-Key on Customer create protects against double-clicks creating
  // duplicate Stripe customers when the DB write hasn't landed yet. Stripe
  // remembers keys for 24h — long after the User row is updated.
  const customer = await stripePost<StripeCustomer>(
    "/customers",
    {
      email,
      "metadata[user_id]": userId,
    },
    { idempotencyKey: `customer:${userId}` },
  );
  log.info({ userId, customerId: customer.id }, "[billing] Stripe customer created");
  return customer.id;
}

/** Map a Stripe price id back to the plan name the app uses. */
export function planFromPriceId(priceId: string): string | undefined {
  for (const [plan, id] of Object.entries(PRICE_IDS)) {
    if (id === priceId) return plan;
  }
  return undefined;
}

/**
 * Upper bound for subscription access, in days from "now". 400 days covers an
 * annual prepay (365d) with ~5 weeks of margin (proration, grace, clock skew).
 * Guards adversarial finding G-007: a crafted/buggy webhook payload can carry
 * an absurd `current_period_end` (→ year 33658) that would otherwise grant
 * effectively unlimited access.
 */
export const MAX_ACCESS_DAYS = 400;
const MS_PER_DAY = 86_400_000;

export interface ClampedAccess {
  /** The clamped access-until instant, safe to persist to `User.accessUntil`. */
  accessUntil: Date;
  /** Which bound fired — drives the log/Sentry warning at the call site. */
  clamped: "none" | "floor" | "ceiling" | "invalid";
}

/**
 * Clamp a Stripe `current_period_end` (unix seconds) to a sane accessUntil
 * window: `[now, now + MAX_ACCESS_DAYS]` (adversarial G-007).
 *
 * Stripe values are trusted on the happy path, but a malformed or malicious
 * webhook payload can carry `0` (→ 1970, instant access loss) or an absurd
 * far-future value (→ year 33658, effectively unlimited access). We pin both
 * ends so a bad payload can neither revoke a paid-up user early nor mint
 * unbounded access.
 *
 * - missing / non-finite / ≤ 0 → floored to `now`, marked `"invalid"`
 * - before now → floored to `now`, marked `"floor"`
 * - after now + MAX_ACCESS_DAYS → capped at the ceiling, marked `"ceiling"`
 * - within bounds → passed through, marked `"none"`
 */
export function clampAccessUntil(
  periodEndSeconds: number | null | undefined,
  now: Date = new Date(),
): ClampedAccess {
  const nowMs = now.getTime();
  const ceilingMs = nowMs + MAX_ACCESS_DAYS * MS_PER_DAY;

  if (periodEndSeconds == null || !Number.isFinite(periodEndSeconds) || periodEndSeconds <= 0) {
    return { accessUntil: new Date(nowMs), clamped: "invalid" };
  }

  const endMs = periodEndSeconds * 1000;
  if (endMs < nowMs) return { accessUntil: new Date(nowMs), clamped: "floor" };
  if (endMs > ceilingMs) return { accessUntil: new Date(ceilingMs), clamped: "ceiling" };
  return { accessUntil: new Date(endMs), clamped: "none" };
}

export interface CheckoutSession {
  url: string;
  id: string;
}

/**
 * Create a Stripe Checkout session for subscription with 28-day trial.
 * AUD pricing; GST handled by Stripe Tax (NFR-029).
 *
 * Trial length 28 days (was 14) so subscribers get 4 Sunday digests during
 * trial instead of 2. The wedge cycle is "Sunday digest → tradie chases →
 * quote → win" which takes 4–6 weeks; 14 days didn't give the user time
 * to validate ROI before the cancel/pay decision.
 *
 * FR-018 | contract.payments.trial = N-day full-access
 */
export async function createCheckoutSession(
  stripeCustomerId: string,
  plan: "solo" | "team",
  successUrl: string,
  cancelUrl: string,
  opts: { withTrial?: boolean } = {},
): Promise<CheckoutSession> {
  const priceId = PRICE_IDS[plan];
  const params: Record<string, string> = {
    customer: stripeCustomerId,
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    // Stripe Tax for GST (NFR-029). `customer_update[address]=auto` lets
    // Checkout write the collected billing address back to the Customer,
    // which automatic_tax requires for the location lookup.
    "automatic_tax[enabled]": "true",
    "customer_update[address]": "auto",
    currency: PRICING.currency.toLowerCase(),
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Reconciliation metadata — the price shown in-app (single source of truth:
    // src/lib/pricing.ts) travels with the subscription so a mismatch between
    // the Stripe Price object and the advertised price is auditable.
    "subscription_data[metadata][plan]": plan,
    "subscription_data[metadata][advertised_price_cents]": String(PRICING.priceCents),
    "subscription_data[metadata][advertised_currency]": PRICING.currency,
    "subscription_data[metadata][gst_inclusive]": String(PRICING.gstInclusive),
  };
  if (opts.withTrial !== false) {
    params["subscription_data[trial_period_days]"] = String(PRICING.trialDays);
  }
  const session = await stripePost<{ url: string; id: string }>("/checkout/sessions", params);
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

/**
 * Reactivate a subscription that is pending cancellation by clearing
 * cancel_at_period_end. Reverses cancelSubscriptionAtPeriodEnd — the
 * subscription stays active/trialing and renews as normal.
 * FR-021 | system-design §2 billing
 */
export async function reactivateSubscription(
  subscriptionId: string,
): Promise<StripeSubscription> {
  return stripePost<StripeSubscription>(`/subscriptions/${subscriptionId}`, {
    cancel_at_period_end: "false",
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
