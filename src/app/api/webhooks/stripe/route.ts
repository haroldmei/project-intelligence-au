// POST /api/webhooks/stripe — idempotent Stripe webhook handler
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-030 | system-design §2 webhooks + §6.2 NFR-015
//
// Validates Stripe-Signature header, updates User.subscriptionStatus + accessUntil.
// Idempotent: keyed on event.id (FR-030).
// GST: Stripe AU / Stripe Tax handles GST line items (NFR-029) — no app-side GST logic needed.
import { db } from "@/lib/db";
import { validateStripeWebhook } from "@/modules/billing/stripe";
import pino from "pino";

const log = pino({ name: "webhook-stripe" });

// Processed events cache (in-memory at preview tier, sufficient for idempotency within one serverless instance)
// At launch tier, use a DB table for cross-instance idempotency.
const processedEvents = new Set<string>();

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing Stripe-Signature" }), { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.error("STRIPE_WEBHOOK_SECRET not set");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), { status: 500 });
  }

  const rawBody = await request.text();
  const { valid, event } = validateStripeWebhook(rawBody, signature, webhookSecret);
  if (!valid || !event) {
    log.warn({ signature: signature.slice(0, 30) }, "[webhook-stripe] invalid signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  // Idempotency check (FR-030)
  if (processedEvents.has(event.id)) {
    log.info({ eventId: event.id }, "[webhook-stripe] duplicate event — skipping");
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }
  processedEvents.add(event.id);

  try {
    await handleStripeEvent(event.type, event.data.object);
  } catch (err) {
    log.error({ eventId: event.id, type: event.type, err }, "[webhook-stripe] handler error");
    // Return 500 so Stripe retries
    return new Response(JSON.stringify({ error: "Handler failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
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
      const status = mapStripeStatus(obj["status"] as string);
      const periodEnd = obj["current_period_end"] as number | undefined;
      await db.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: status,
          accessUntil: periodEnd ? new Date(periodEnd * 1000) : undefined,
        },
      });
      log.info({ userId: user.id, status }, "[webhook-stripe] subscription updated");
      break;
    }
    case "customer.subscription.deleted": {
      await db.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: "cancelled" },
      });
      log.info({ userId: user.id }, "[webhook-stripe] subscription cancelled");
      break;
    }
    case "invoice.payment_failed": {
      await db.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: "past_due" },
      });
      log.warn({ userId: user.id }, "[webhook-stripe] payment failed → past_due");
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
            accessUntil: periodEnd ? new Date(periodEnd * 1000) : undefined,
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

function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    active: "active",
    trialing: "trial",
    past_due: "past_due",
    canceled: "cancelled",
    unpaid: "past_due",
    paused: "past_due",
  };
  return map[stripeStatus] ?? "trial";
}
