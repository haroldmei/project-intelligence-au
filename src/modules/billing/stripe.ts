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
import * as Sentry from "@sentry/nextjs";
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
 * Plans the app can currently represent AND serve end-to-end: the account page
 * has a plan label + seat count for it (src/app/(portal)/account/page.tsx) AND
 * the digest pipeline can deliver it. Multi-seat "team" is sold-through in
 * Stripe config — STRIPE_PRICE_ID_TEAM is required in prod (src/lib/env.ts) so
 * the price object exists — but is NOT yet buildable here: no team creation, no
 * seat invites, no per-seat digest fan-out (see the /plan picker and checkout,
 * which both gate "team" off). A subscription that carries the team price is
 * therefore an anomaly, not a valid state, and MUST NOT be persisted onto the
 * user: doing so left the account rendering Plan '—' / 1 seat while the customer
 * was billed AUD 499 Team (issue #164). The webhook surfaces it (Sentry) and
 * keeps the last representable plan instead. Re-add "team" here — in lockstep
 * with the account-page labels, seat UI, and fan-out — when multi-seat ships.
 */
export const REPRESENTABLE_PLANS: ReadonlySet<string> = new Set(["solo"]);

/** True when the app can fully render and serve `plan` end-to-end. */
export function isRepresentablePlan(plan: string): boolean {
  return REPRESENTABLE_PLANS.has(plan);
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

// Stripe rejects an absolute subscription `trial_end` that is less than 48 hours
// in the future. A converter with under two days of trial left — or one already
// past their signup window — therefore gets no trial and starts paying now.
export const STRIPE_MIN_TRIAL_SECONDS = 48 * 60 * 60;

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
 * Create a Stripe Checkout session for a subscription.
 *
 * Trial length is 28 days (was 14) so subscribers get 4 Sunday digests during
 * trial instead of 2. The wedge cycle is "Sunday digest → tradie chases →
 * quote → win" which takes 4–6 weeks; 14 days didn't give the user time
 * to validate ROI before the cancel/pay decision.
 *
 * The trial clock starts at SIGNUP, not at checkout (issue #198). The product
 * grants a SINGLE 28-day window (subscriptionStatus:'trial' + entitlement from
 * createdAt+28d); a self-signup trialer who converts mid-trial must get only the
 * REMAINDER of that window, never a fresh 28 days. So the caller passes the
 * absolute signup+28d deadline as `trialEndsAt` and we anchor Stripe with an
 * absolute `subscription_data[trial_end]` rather than a rolling
 * `trial_period_days`: first charge lands at signup+28d no matter when they
 * check out, and the Stripe trial_end stays consistent with the webhook-derived
 * accessUntil the trial-reminder cron anchors on.
 *
 * No `trialEndsAt` (a cancelled re-subscriber — they've already had their one
 * trial), or a deadline Stripe won't accept (< 48h out, which also covers an
 * already-elapsed signup window), means no trial: the customer is charged
 * immediately.
 *
 * AUD pricing; GST handled by Stripe Tax (NFR-029).
 * FR-018 | contract.payments.trial = N-day full-access
 */
export async function createCheckoutSession(
  stripeCustomerId: string,
  plan: "solo" | "team",
  successUrl: string,
  cancelUrl: string,
  opts: { trialEndsAt?: Date } = {},
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
  // Anchor the trial to the absolute signup+28d deadline, not a rolling
  // trial_period_days, so a mid-trial converter never gets a fresh 28-day
  // window (issue #198). Stripe requires trial_end ≥ 48h out; a nearer deadline
  // (or an already-elapsed one) is dropped and the customer is charged now.
  if (opts.trialEndsAt) {
    const trialEndSec = Math.floor(opts.trialEndsAt.getTime() / 1000);
    const minTrialEndSec = Math.floor(Date.now() / 1000) + STRIPE_MIN_TRIAL_SECONDS;
    if (trialEndSec >= minTrialEndSec) {
      params["subscription_data[trial_end]"] = String(trialEndSec);
    }
  }
  const session = await stripePost<{ url: string; id: string }>("/checkout/sessions", params);
  return { url: session.url, id: session.id };
}

// Cache the "no plan switching" portal configuration id for the process
// lifetime so we create it once, not on every portal open. A module-level
// promise dedupes concurrent creates within a warm instance; a cold start (or a
// prior failure resetting it to null) recreates it, which Stripe deduplicates
// via the stable Idempotency-Key below within its 24h window.
let noPlanSwitchPortalConfig: Promise<string | null> | null = null;

/**
 * Create (once) a Billing Portal configuration that DISABLES plan switching.
 *
 * The portal is purpose-labelled "cancel/upgrade", but the app cannot represent
 * the Team plan yet (see REPRESENTABLE_PLANS): if the portal let a Solo
 * subscriber switch to the Team price, they'd be billed AUD 499 for a plan the
 * account page renders as '—' / 1 seat (issue #164). We pin `subscription_update`
 * off so "Manage billing" can update cards, view invoices, and cancel — but can
 * never move a subscriber onto an unrepresentable price.
 *
 * Best-effort by design: if Stripe rejects the create (misconfigured business
 * profile, API change, …) we return null and the caller falls back to the
 * account's default portal configuration — managing billing must never break.
 * The webhook guard (route.ts) is the backstop that catches a Team price
 * regardless of how it was reached.
 */
async function ensureNoPlanSwitchPortalConfig(): Promise<string | null> {
  if (!noPlanSwitchPortalConfig) {
    noPlanSwitchPortalConfig = (async (): Promise<string | null> => {
      try {
        const appUrl = env.NEXT_PUBLIC_APP_URL;
        const config = await stripePost<{ id: string }>(
          "/billing_portal/configurations",
          {
            "business_profile[privacy_policy_url]": `${appUrl}/privacy`,
            "business_profile[terms_of_service_url]": `${appUrl}/terms`,
            // The lock: no plan switching. Everything else the portal is for
            // (cards, invoices, cancel, contact details) stays enabled.
            "features[subscription_update][enabled]": "false",
            "features[subscription_cancel][enabled]": "true",
            "features[payment_method_update][enabled]": "true",
            "features[invoice_history][enabled]": "true",
            "features[customer_update][enabled]": "true",
            "features[customer_update][allowed_updates][0]": "email",
            "features[customer_update][allowed_updates][1]": "address",
            "features[customer_update][allowed_updates][2]": "phone",
          },
          { idempotencyKey: "portal-config:no-plan-switch:v1" },
        );
        log.info({ configurationId: config.id }, "[billing] no-plan-switch portal configuration ready");
        return config.id;
      } catch (err) {
        log.error(
          { err },
          "[billing] could not create no-plan-switch portal configuration — falling back to Stripe default",
        );
        Sentry.captureException(err, { tags: { phase: "billing-portal-config" } });
        noPlanSwitchPortalConfig = null; // let the next portal open retry
        return null;
      }
    })();
  }
  return noPlanSwitchPortalConfig;
}

/**
 * Create a Stripe Customer Portal session (cancel/manage — NOT upgrade). Bound
 * to a configuration that disables plan switching so a Solo subscriber can't
 * self-serve onto the unrepresentable Team price (issue #164); falls back to the
 * account default configuration if that config can't be created.
 * FR-019 | system-design §2 billing
 */
export async function createBillingPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  const configurationId = await ensureNoPlanSwitchPortalConfig();
  const params: Record<string, string> = {
    customer: stripeCustomerId,
    return_url: returnUrl,
  };
  if (configurationId) params.configuration = configurationId;
  return stripePost<{ url: string }>("/billing_portal/sessions", params);
}

export interface StripeSubscription {
  id: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
}

// Stripe subscription statuses that represent a LIVE, cancellable subscription,
// in preference order. active/trialing are the normally-entitled states;
// past_due/unpaid/paused are dunning states the entitlement module deliberately
// keeps live (issue #106) — the card is failing but the subscription is NOT yet
// cancelled, so it is still cancellable in-product and MUST be returned here.
// Omitting them (issue #132) made a dunning subscriber's live subscription
// invisible to every cancel/reactivate/erasure path: they got a 404 and were
// then billed AUD 99 when Stripe's smart-retry recovered the card.
const CANCELLABLE_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused"] as const;

/**
 * Fetch the customer's live, cancellable subscription — active, trialing, or a
 * dunning state (past_due/unpaid/paused). Returns null only when the customer
 * has no cancellable subscription (e.g. already canceled/incomplete_expired).
 * FR-021 | system-design §2 billing
 */
export async function getActiveSubscription(
  stripeCustomerId: string,
): Promise<StripeSubscription | null> {
  // status=all (not status=active) so dunning subscriptions are visible; filter
  // to the cancellable set below. limit=100 (Stripe's max) so a rare customer
  // with several historical subscriptions can't push the live one off the page.
  const { data } = await stripeGet<{ data: StripeSubscription[] }>(
    `/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=all&limit=100`,
  );
  // Preference order: return an active/trialing sub over a dunning one if a
  // customer somehow has both, so we never cancel the wrong subscription.
  for (const status of CANCELLABLE_STATUSES) {
    const match = data.find((s) => s.status === status);
    if (match) return match;
  }
  return null;
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
