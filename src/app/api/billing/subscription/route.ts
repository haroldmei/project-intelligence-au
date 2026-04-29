// DELETE /api/billing/subscription — cancel subscription at period end
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-021 | system-design §2 billing
//
// Sets cancel_at_period_end = true on Stripe. Access continues until period end.
// V1: reason is logged only, not persisted.
import { NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  getActiveSubscription,
  cancelSubscriptionAtPeriodEnd,
} from "@/modules/billing/stripe";
import pino from "pino";

const log = pino({ name: "billing-cancel" });

const CancelInput = z.object({
  reason: z.string().max(500).optional(),
});

export async function DELETE(request: Request): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Parse optional body
  let reason: string | undefined;
  try {
    const raw = await request.text();
    if (raw.trim()) {
      const parsed = CancelInput.safeParse(JSON.parse(raw));
      if (parsed.success) reason = parsed.data.reason;
    }
  } catch {
    // body is optional — ignore parse errors
  }

  if (reason) {
    log.info({ userId: auth.user.id, reason }, "[billing-cancel] cancellation reason captured (V1: log only)");
  }

  const user = await db.user.findUnique({ where: { id: auth.user.id } });
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
  }

  try {
    const subscription = await getActiveSubscription(user.stripeCustomerId);
    if (!subscription) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }

    const updated = await cancelSubscriptionAtPeriodEnd(subscription.id);
    const accessUntil = new Date(updated.current_period_end * 1000).toISOString();

    log.info(
      { userId: auth.user.id, subscriptionId: subscription.id, accessUntil },
      "[billing-cancel] subscription set to cancel at period end",
    );

    return NextResponse.json({ ok: true, accessUntil });
  } catch (err) {
    log.error({ userId: auth.user.id, err }, "[billing-cancel] Stripe error");
    return NextResponse.json({ error: "Failed to cancel subscription" }, { status: 500 });
  }
}
