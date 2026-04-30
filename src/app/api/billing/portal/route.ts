// POST /api/billing/portal — redirect to Stripe Billing Portal (cancel/upgrade)
// FR-019 | system-design §4 API design
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { rateLimitMutatingByUser } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db";
import { createBillingPortalSession } from "@/modules/billing/stripe";
import { env } from "@/lib/env";

const APP_BASE = env.NEXT_PUBLIC_APP_URL;

export async function POST(_request: Request): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitMutatingByUser(auth.user.id, "billing-portal");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  if (!user.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  const session = await createBillingPortalSession(
    user.stripeCustomerId,
    `${APP_BASE}/account`,
  );
  return NextResponse.json({ portal_url: session.url });
}
