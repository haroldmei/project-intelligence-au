// POST /api/webhooks/stripe — idempotent Stripe webhook handler
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-030 | system-design §2 webhooks + §6.2 NFR-015
//
// Validates Stripe-Signature header, updates User.subscriptionStatus + accessUntil.
// Idempotent: keyed on event.id (FR-030) via the stripe_webhook_events table.
// GST: Stripe AU / Stripe Tax handles GST line items (NFR-029) — no app-side GST logic needed.
import { db } from "@/lib/db";
import {
  validateStripeWebhook,
  planFromPriceId,
  clampAccessUntil,
  MAX_ACCESS_DAYS,
} from "@/modules/billing/stripe";
import { env } from "@/lib/env";
import { captureServer } from "@/lib/analytics/server";
import * as Sentry from "@sentry/nextjs";
import pino from "pino";

const log = pino({ name: "webhook-stripe" });

/**
 * Clamp a Stripe period-end to a sane accessUntil window, warning (log +
 * Sentry) when a bound fires. A clamp means the payload was anomalous — a
 * far-future/absurd value (would over-grant), a past value, or missing —
 * which is worth surfacing even though we've handled it safely (G-007).
 */
function clampAndWarn(
  periodEndSeconds: number | null | undefined,
  ctx: { userId: string; eventType: string },
): Date {
  const { accessUntil, clamped } = clampAccessUntil(periodEndSeconds);
  if (clamped !== "none") {
    log.warn(
      { ...ctx, periodEndSeconds, clamped, accessUntil, maxAccessDays: MAX_ACCESS_DAYS },
      `[webhook-stripe] accessUntil clamped (${clamped}) — anomalous current_period_end`,
    );
    Sentry.captureMessage(
      `Stripe accessUntil clamped (${clamped}) for user ${ctx.userId}`,
      { level: "warning", tags: { userId: ctx.userId, phase: "billing-accessuntil-clamp", clamped } },
    );
  }
  return accessUntil;
}

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing Stripe-Signature" }), { status: 400 });
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    log.error("STRIPE_WEBHOOK_SECRET not set — webhook disabled in this environment");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), { status: 500 });
  }

  const rawBody = await request.text();
  const { valid, event } = validateStripeWebhook(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid || !event) {
    log.warn({ signature: signature.slice(0, 30) }, "[webhook-stripe] invalid signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  // Idempotency (FR-030). Insert-first: a unique-constraint violation means
  // another invocation already claimed this event, so we ack and skip.
  try {
    await db.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      log.info({ eventId: event.id }, "[webhook-stripe] duplicate event — skipping");
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }
    log.error({ eventId: event.id, err }, "[webhook-stripe] dedupe insert failed");
    return new Response(JSON.stringify({ error: "Dedupe failed" }), { status: 500 });
  }

  try {
    await handleStripeEvent(event.type, event.data.object);
  } catch (err) {
    // Roll back the dedupe row so Stripe's retry has a chance to land.
    await db.stripeWebhookEvent.delete({ where: { id: event.id } }).catch(() => {});
    log.error({ eventId: event.id, type: event.type, err }, "[webhook-stripe] handler error");
    return new Response(JSON.stringify({ error: "Handler failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}

function isUniqueViolation(err: unknown): boolean {
  // Prisma's known-request errors expose P2002 as a `code` property; the
  // human-readable message ("Unique constraint failed…") doesn't include it.
  if (typeof err !== "object" || err === null) return false;
  return (err as { code?: unknown }).code === "P2002";
}

async function handleStripeEvent(type: string, obj: Record<string, unknown>): Promise<void> {
  const customerId = obj["customer"] as string | undefined;
  if (!customerId) return;

  const user = await db.user.findFirst({ where: { stripeCustomerId: customerId } });
  if (!user) {
    log.warn({ customerId, type }, "[webhook-stripe] no user found for customer");
    return;
  }

  switch (type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const status = mapStripeStatus(obj["status"] as string, user.subscriptionStatus);
      const periodEnd = obj["current_period_end"] as number | undefined;
      const cancelAtPeriodEnd = obj["cancel_at_period_end"] === true;
      const items = obj["items"] as { data?: Array<{ price?: { id?: string } }> } | undefined;
      const priceId = items?.data?.[0]?.price?.id;
      const plan = priceId ? planFromPriceId(priceId) : undefined;

      await db.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: status,
          accessUntil: clampAndWarn(periodEnd, { userId: user.id, eventType: type }),
          cancelAtPeriodEnd,
          ...(plan ? { plan } : {}),
        },
      });
      log.info(
        { userId: user.id, status, cancelAtPeriodEnd, plan },
        "[webhook-stripe] subscription updated",
      );
      // Conversion = transition INTO active from any non-active state (trial,
      // past_due, …). Guarded on the prior DB value so re-delivered `updated`
      // events for an already-active sub don't double-count.
      if (status === "active" && user.subscriptionStatus !== "active") {
        captureServer(user.id, "trial_converted", {});
      }
      break;
    }
    case "customer.subscription.deleted": {
      await db.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: "cancelled", cancelAtPeriodEnd: false },
      });
      log.info({ userId: user.id }, "[webhook-stripe] subscription cancelled");
      captureServer(user.id, "subscription_cancelled", { cancelAtPeriodEnd: false });
      break;
    }
    case "invoice.payment_failed":
    case "invoice.payment_action_required": {
      // payment_action_required = card needs 3DS / SCA challenge. Treat as
      // past_due so the user sees "update card" CTA on /account; portal
      // surfaces the Stripe-hosted 3DS confirmation flow.
      await db.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: "past_due" },
      });
      log.warn({ userId: user.id, type }, "[webhook-stripe] payment requires action → past_due");
      break;
    }
    case "invoice.payment_succeeded": {
      // Re-activate if past_due
      if (user.subscriptionStatus === "past_due") {
        const periodEnd = (obj["lines"] as { data: Array<{ period: { end: number } }> })
          ?.data?.[0]?.period?.end;
        await db.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: "active",
            accessUntil: clampAndWarn(periodEnd, { userId: user.id, eventType: type }),
          },
        });
        log.info({ userId: user.id }, "[webhook-stripe] payment succeeded → active");
      }
      break;
    }
    default:
      log.debug({ type }, "[webhook-stripe] unhandled event type");
  }
}

function mapStripeStatus(stripeStatus: string, currentStatus: string): string {
  const map: Record<string, string> = {
    active: "active",
    trialing: "trial",
    past_due: "past_due",
    canceled: "cancelled",
    unpaid: "past_due",
    paused: "past_due",
  };
  // Unknown statuses (incomplete, incomplete_expired, future Stripe additions)
  // shouldn't silently downgrade the user — keep the existing DB value.
  return map[stripeStatus] ?? currentStatus;
}
