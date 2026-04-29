// POST /api/billing/checkout — create Stripe Checkout session
// FR-018 | system-design §4 API design | contract.payments.*
import { NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ensureStripeCustomer, createCheckoutSession } from "@/modules/billing/stripe";
import { env } from "@/lib/env";

const APP_BASE = env.NEXT_PUBLIC_APP_URL;

const CheckoutInput = z.object({
  plan: z.enum(["solo", "team"]),
});

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const customerId = await ensureStripeCustomer(user.id, user.email, user.stripeCustomerId);

  if (!user.stripeCustomerId) {
    await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  // Re-subscribers (previously cancelled) don't get another 14-day trial —
  // they've already had one. Trial-eligible: anyone who hasn't cancelled.
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
