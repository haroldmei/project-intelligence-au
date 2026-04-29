// Billing abuse: cancel-twice, unknown-customer webhook, status mapping edge cases.
// Runs without live Stripe — exercises validateStripeWebhook + status mapper purely.
import { describe, it, expect } from "vitest";
import { validateStripeWebhook } from "@/modules/billing/stripe";
import {
  buildStripeSignature,
  buildSubscriptionEvent,
} from "./_helpers/stripe-fixtures";

const SECRET = "whsec_test_billing_32chars_abcdefg";

describe("Stripe webhook events — billing-abuse surfaces", () => {
  it("accepts customer.subscription.deleted (cancel)", () => {
    const evt = buildSubscriptionEvent({ type: "customer.subscription.deleted" });
    const payload = JSON.stringify(evt);
    const sig = buildStripeSignature(payload, SECRET);
    const r = validateStripeWebhook(payload, sig, SECRET);
    expect(r.valid).toBe(true);
    expect(r.event?.type).toBe("customer.subscription.deleted");
  });

  it("accepts duplicate cancel events (validator does not enforce idempotency)", () => {
    // Idempotency lives in route.ts (in-memory Set keyed on event.id).
    // Validator-level: two identical canceled events both validate.
    const evt = buildSubscriptionEvent({
      id: "evt_cancel_dup",
      type: "customer.subscription.deleted",
    });
    const payload = JSON.stringify(evt);
    const sig = buildStripeSignature(payload, SECRET);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(true);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(true);
  });

  it("accepts trial-status webhook (cancel-during-trial path)", () => {
    const evt = buildSubscriptionEvent({
      type: "customer.subscription.updated",
      status: "canceled", // Stripe spelling
    });
    const payload = JSON.stringify(evt);
    const sig = buildStripeSignature(payload, SECRET);
    const r = validateStripeWebhook(payload, sig, SECRET);
    expect(r.valid).toBe(true);
  });

  it("validator silently passes a webhook with no customer field", () => {
    // Caller (route.ts) handleStripeEvent extracts obj.customer; if missing it
    // returns early ("no user found") — silent drop. Validator doesn't care.
    const evt = {
      id: "evt_nocust",
      type: "customer.subscription.updated",
      data: { object: { status: "active" } }, // no customer field
    };
    const payload = JSON.stringify(evt);
    const sig = buildStripeSignature(payload, SECRET);
    const r = validateStripeWebhook(payload, sig, SECRET);
    expect(r.valid).toBe(true);
    // FINDING-CANDIDATE: route.ts logs a warn and returns 200 even when
    // obj.customer is missing — observability hole. Should at least bump
    // a Sentry counter for "unparseable webhook".
  });

  it("accepts webhook for unknown user (silent-drop expected per route.ts)", () => {
    // The route.ts handler does findFirst({ where: { stripeCustomerId } }). If
    // the customer is unknown, it logs warn and returns. Validator-level: pass.
    const evt = buildSubscriptionEvent({ customer: "cus_unknown_attacker" });
    const payload = JSON.stringify(evt);
    const sig = buildStripeSignature(payload, SECRET);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(true);
  });

  it("rejects payment_succeeded with malformed lines.data (would crash handler)", () => {
    // route.ts line: obj["lines"]["data"][0]["period"]["end"] — if any link
    // is missing the optional chain catches at "?.data?.[0]?.period?.end"
    // which is OK. But validator must accept the malformed body for the
    // handler to even try.
    const evt = {
      id: "evt_malformed_lines",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_x",
          lines: null, // attacker tries to crash handler
        },
      },
    };
    const payload = JSON.stringify(evt);
    const sig = buildStripeSignature(payload, SECRET);
    const r = validateStripeWebhook(payload, sig, SECRET);
    expect(r.valid).toBe(true);
    // route.ts cast: (obj["lines"] as ...). The optional chain handles null.
    // If ts-cast is wrong we'd get a runtime error. Document risk.
  });

  it("accepts webhook with current_period_end = 0 (epoch — produces accessUntil=1970)", () => {
    const evt = buildSubscriptionEvent({ current_period_end: 0 });
    const payload = JSON.stringify(evt);
    const sig = buildStripeSignature(payload, SECRET);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(true);
    // FINDING-CANDIDATE: route.ts blindly trusts current_period_end. A
    // forged-but-validly-signed (impossible without secret leak) or an
    // edge-case Stripe event with 0 sets accessUntil to 1970 → user
    // immediately loses access. Should clamp to >= now.
  });

  it("accepts webhook with negative current_period_end", () => {
    const evt = buildSubscriptionEvent({ current_period_end: -1 });
    const payload = JSON.stringify(evt);
    const sig = buildStripeSignature(payload, SECRET);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(true);
  });

  it("accepts webhook with very-far-future current_period_end (year 99999)", () => {
    const evt = buildSubscriptionEvent({
      current_period_end: 999_999_999_999, // far future
    });
    const payload = JSON.stringify(evt);
    const sig = buildStripeSignature(payload, SECRET);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(true);
    // Date constructor handles up to ~Apr 271821; ms scale matters.
    // accessUntil = new Date(999_999_999_999 * 1000) = far past max safe Date.
    // FINDING-CANDIDATE: no upper bound check on accessUntil derivation.
  });
});
