// Stripe webhook payload + signature helpers for adversarial tests.
// Mocks Stripe at the SDK boundary — never makes a network call.
import { createHmac } from "node:crypto";

export interface StripeFixtureEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export function buildStripeSignature(
  payload: string,
  secret: string,
  ts = Math.floor(Date.now() / 1000),
): string {
  const data = `${ts}.${payload}`;
  const sig = createHmac("sha256", secret).update(data).digest("hex");
  return `t=${ts},v1=${sig}`;
}

export function buildSubscriptionEvent(
  overrides: Partial<{
    id: string;
    type: string;
    customer: string;
    status: string;
    current_period_end: number;
  }> = {},
): StripeFixtureEvent {
  return {
    id: overrides.id ?? `evt_${Math.random().toString(36).slice(2, 10)}`,
    type: overrides.type ?? "customer.subscription.updated",
    data: {
      object: {
        customer: overrides.customer ?? "cus_test",
        status: overrides.status ?? "active",
        current_period_end:
          overrides.current_period_end ?? Math.floor(Date.now() / 1000) + 86400,
      },
    },
  };
}
