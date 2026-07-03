// POST /api/billing/checkout — create Stripe Checkout session
// FR-018 | system-design §4 API design | contract.payments.*
import { NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth/session";
import { rateLimitMutatingByUser } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db";
import {
  ensureStripeCustomer,
  createCheckoutSession,
  getActiveSubscription,
} from "@/modules/billing/stripe";
import { env } from "@/lib/env";

const APP_BASE = env.NEXT_PUBLIC_APP_URL;

const CheckoutInput = z.object({
  // Team is gated off until multi-seat is implemented — see the plan picker.
  // The enum keeps the type for future re-enabling; the refine rejects it now.
  plan: z
    .enum(["solo", "team"])
    .refine((p) => p !== "team", { message: "Team plan is not available yet" }),
});

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 30/hr per user — protects against abuse that creates Stripe customers
  // or burns checkout-session API quota.
  const rl = rateLimitMutatingByUser(auth.user.id, "billing-checkout");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CheckoutInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id } });

  // Guard against stacking a second subscription. A user who already has a
  // live Stripe subscription must manage it through the billing portal — a
  // fresh Checkout session would spin up a SECOND subscription (double-billing)
  // AND mint another 28-day trial. Only genuinely un-subscribed users reach
  // createCheckoutSession: a never-checked-out self-signup trial, or a
  // previously cancelled re-subscriber.
  //
  // `active` / `past_due` are unambiguous — those statuses are only ever set by
  // webhooks about a real Stripe subscription. `trial` is ambiguous: it is also
  // the default self-signup state (schema `@default("trial")`) for a user who
  // has never entered checkout and has no Stripe subscription, so we must NOT
  // block their first checkout. We disambiguate by asking Stripe: a real
  // active/trialing subscription means they've already subscribed.
  const hasLiveSubscription =
    user.subscriptionStatus === "active" ||
    user.subscriptionStatus === "past_due" ||
    (user.subscriptionStatus === "trial" &&
      user.stripeCustomerId != null &&
      (await getActiveSubscription(user.stripeCustomerId)) != null);

  if (hasLiveSubscription) {
    return NextResponse.json(
      {
        error: "You already have an active subscription. Manage it from the billing portal.",
        code: "already_subscribed",
      },
      { status: 409 },
    );
  }

  const customerId = await ensureStripeCustomer(user.id, user.email, user.stripeCustomerId);

  if (!user.stripeCustomerId) {
    await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  // Re-subscribers (previously cancelled) don't get another 28-day trial —
  // they've already had one. Everyone reaching here who isn't cancelled is a
  // first-time subscriber (the guard above rejected anyone with a live
  // subscription), so trial-eligible = not a cancelled re-subscriber.
  const withTrial = user.subscriptionStatus !== "cancelled";

  const session = await createCheckoutSession(
    customerId,
    parsed.data.plan,
    `${APP_BASE}/account?billing=success`,
    `${APP_BASE}/account?billing=cancelled`,
    { withTrial },
  );

  return NextResponse.json({ checkout_url: session.url });
}
