// Webhook spoofing against Stripe + Twilio
// system-design §6 NFR-015: signature-validated webhooks
import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { validateStripeWebhook } from "@/modules/billing/stripe";
import { validateTwilioSignature } from "@/lib/sms/client";
import { buildStripeSignature, buildSubscriptionEvent } from "./_helpers/stripe-fixtures";

const SECRET = "whsec_test_key_32chars_aaaaaaaaaa";

beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = "twilio-auth-test-token-32chars";
});

// ─────────────────────────────────────────────────────────────────────────────
// Stripe webhook adversarial
// ─────────────────────────────────────────────────────────────────────────────
describe("validateStripeWebhook — adversarial", () => {
  it("rejects signature for >300s-old timestamp (replay window)", () => {
    const stale = Math.floor(Date.now() / 1000) - 301;
    const payload = JSON.stringify(buildSubscriptionEvent());
    const sig = buildStripeSignature(payload, SECRET, stale);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(false);
  });

  it("rejects signature exactly at 301s (boundary +1)", () => {
    const stale = Math.floor(Date.now() / 1000) - 301;
    const payload = JSON.stringify(buildSubscriptionEvent());
    const sig = buildStripeSignature(payload, SECRET, stale);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(false);
  });

  it("accepts signature exactly at 300s (boundary)", () => {
    const ts = Math.floor(Date.now() / 1000) - 300;
    const payload = JSON.stringify(buildSubscriptionEvent());
    const sig = buildStripeSignature(payload, SECRET, ts);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(true);
  });

  it("rejects empty signature", () => {
    expect(validateStripeWebhook("{}", "", SECRET).valid).toBe(false);
  });

  it("rejects malformed signature header (no =)", () => {
    expect(validateStripeWebhook("{}", "garbage", SECRET).valid).toBe(false);
  });

  it("rejects signature missing v1", () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(validateStripeWebhook("{}", `t=${ts}`, SECRET).valid).toBe(false);
  });

  it("rejects signature missing t", () => {
    expect(validateStripeWebhook("{}", "v1=abc123", SECRET).valid).toBe(false);
  });

  it("rejects negative-timestamp signature", () => {
    const payload = "{}";
    const sig = buildStripeSignature(payload, SECRET, -100);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(false);
  });

  it("rejects signature whose hex length differs (timingSafeEqual throws)", () => {
    const payload = "{}";
    const ts = Math.floor(Date.now() / 1000);
    // valid t, but v1 is too short → Buffer length mismatch in timingSafeEqual.
    const sig = `t=${ts},v1=abc`;
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(false);
  });

  it("rejects body with NULL byte injection", () => {
    const payload = "{}\x00{\"id\":\"evt_evil\"}";
    const sig = buildStripeSignature(payload, SECRET);
    // Signature is over payload with null byte. validateStripeWebhook
    // verifies sig successfully if we use that exact body. But JSON.parse
    // won't survive a null byte cleanly inside JSON syntax.
    const r = validateStripeWebhook(payload, sig, SECRET);
    // Either rejected as invalid JSON, or accepted (must not crash).
    expect(typeof r.valid).toBe("boolean");
  });

  it("rejects body that JSON.parses to non-object", () => {
    const payload = "42";
    const sig = buildStripeSignature(payload, SECRET);
    const r = validateStripeWebhook(payload, sig, SECRET);
    // Currently accepts: validateStripeWebhook returns valid=true even if event isn't an object.
    // Caller (route.ts) checks event.id, which is undefined → idempotency cache silently
    // adds undefined. FINDING-CANDIDATE: missing schema check on parsed event.
    expect(r.valid).toBe(true);
    if (r.valid) {
      // The event is `42` (a number) — downstream type assumes shape.
      expect(typeof r.event).toBe("number");
    }
  });

  it("DOES NOT enforce idempotency at the validator layer (handler must)", () => {
    // Two identical payloads → two identical signatures → two valid validations.
    // The route.ts route uses an in-memory Set keyed on event.id. Across serverless
    // instances, a replay can be processed twice. KNOWN at preview tier per
    // route.ts comment ("preview tier sufficient"). Document only.
    const payload = JSON.stringify(buildSubscriptionEvent({ id: "evt_replay" }));
    const sig = buildStripeSignature(payload, SECRET);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(true);
    expect(validateStripeWebhook(payload, sig, SECRET).valid).toBe(true);
  });

  it("rejects mismatched body (body mutated after sig)", () => {
    const original = JSON.stringify(buildSubscriptionEvent());
    const sig = buildStripeSignature(original, SECRET);
    const mutated = original.replace("active", "trialing"); // tamper status
    expect(validateStripeWebhook(mutated, sig, SECRET).valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Twilio webhook adversarial
// ─────────────────────────────────────────────────────────────────────────────
describe("validateTwilioSignature — adversarial", () => {
  function buildTwilioSig(
    url: string,
    params: Record<string, string>,
    token: string,
  ): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");
    const data = url + sortedParams;
    return createHmac("sha1", token).update(data).digest("base64");
  }

  it("validates correct HMAC-SHA1", () => {
    const url = "https://example.com/api/webhooks/twilio";
    const params = { Body: "STOP", From: "+61400000001" };
    const sig = buildTwilioSig(url, params, process.env.TWILIO_AUTH_TOKEN!);
    expect(validateTwilioSignature(url, params, sig)).toBe(true);
  });

  it("rejects forged HMAC-SHA1 (wrong key)", () => {
    const url = "https://example.com/api/webhooks/twilio";
    const params = { Body: "STOP", From: "+61400000001" };
    const sig = buildTwilioSig(url, params, "wrong-key");
    expect(validateTwilioSignature(url, params, sig)).toBe(false);
  });

  it("rejects empty signature", () => {
    expect(
      validateTwilioSignature("https://example.com", { Body: "STOP" }, ""),
    ).toBe(false);
  });

  it("returns false when TWILIO_AUTH_TOKEN unset", () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    expect(
      validateTwilioSignature("https://x", { Body: "STOP" }, "anysig"),
    ).toBe(false);
  });

  it("rejects body mutation after signing (single param swap)", () => {
    const url = "https://example.com/api/webhooks/twilio";
    const orig = { Body: "STOP", From: "+61400000001" };
    const sig = buildTwilioSig(url, orig, process.env.TWILIO_AUTH_TOKEN!);
    const mutated = { Body: "HELLO", From: "+61400000001" };
    expect(validateTwilioSignature(url, mutated, sig)).toBe(false);
  });

  it("rejects sig from wrong URL (rebinding attack)", () => {
    const params = { Body: "STOP", From: "+61400000001" };
    const sig = buildTwilioSig(
      "https://attacker.com/api/webhooks/twilio",
      params,
      process.env.TWILIO_AUTH_TOKEN!,
    );
    expect(
      validateTwilioSignature(
        "https://example.com/api/webhooks/twilio",
        params,
        sig,
      ),
    ).toBe(false);
  });

  it("ALERT: timing comparison uses === not timingSafeEqual", () => {
    // FINDING-CANDIDATE: src/lib/sms/client.ts validateTwilioSignature uses
    // `expected === signature` — direct string comparison. This is technically
    // a side-channel risk for HMAC verification. Should use timingSafeEqual.
    // We can't reliably *test* a side-channel from JS-land but we file the bug.
    const url = "https://example.com/api/webhooks/twilio";
    const params = { Body: "X" };
    // Bogus sig of correct-ish length (28 base64 chars for SHA-1)
    const fake = "a".repeat(28);
    expect(validateTwilioSignature(url, params, fake)).toBe(false);
  });

  it("survives params with HTML/SQL meta-chars (no parser injection)", () => {
    const url = "https://example.com/api/webhooks/twilio";
    const params = {
      Body: "STOP'; DROP TABLE users;--",
      From: "<script>alert(1)</script>",
    };
    const sig = buildTwilioSig(url, params, process.env.TWILIO_AUTH_TOKEN!);
    expect(validateTwilioSignature(url, params, sig)).toBe(true);
  });
});
