// Unit tests for the Twilio webhook signature validator (no DB needed).
// system-design §6 NFR-015 | adversarial finding G-006 (tests/adversarial/FINDINGS.md).
//
// These are hermetic: we mock @/lib/env so `env.TWILIO_AUTH_TOKEN` is a known,
// stable value. `validateTwilioSignature` reads the token from `env`, which
// @/lib/env freezes at import time — a runtime `process.env` mutation would NOT
// be picked up, so the token MUST be injected via the mock (not process.env).
import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";

// NOTE: keep this literal in sync with the vi.mock factory below. The factory
// is hoisted above module-scope consts, so it cannot reference AUTH_TOKEN.
const AUTH_TOKEN = "test_twilio_auth_token";

vi.mock("@/lib/env", () => ({
  env: { TWILIO_AUTH_TOKEN: "test_twilio_auth_token" },
}));

import { validateTwilioSignature } from "@/lib/sms/client";

const URL = "https://digest.example.com/api/webhooks/twilio";
const PARAMS = { From: "+61400000077", Body: "STOP", MessageSid: "SM123" };

/** Reproduce Twilio's signing scheme: HMAC-SHA1(url + sorted k=value pairs). */
function sign(url: string, params: Record<string, string>, token = AUTH_TOKEN): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");
  return createHmac("sha1", token).update(data).digest("base64");
}

describe("validateTwilioSignature — timing-safe comparison (G-006)", () => {
  it("accepts a valid signature", () => {
    expect(validateTwilioSignature(URL, PARAMS, sign(URL, PARAMS))).toBe(true);
  });

  it("rejects a tampered but equal-length signature", () => {
    const good = sign(URL, PARAMS);
    // Flip the first base64 char to keep the length identical (exercises the
    // constant-time compare path, not the length guard).
    const tampered = (good[0] === "A" ? "B" : "A") + good.slice(1);
    expect(tampered.length).toBe(good.length);
    expect(validateTwilioSignature(URL, PARAMS, tampered)).toBe(false);
  });

  it("rejects a signature computed with the wrong auth token", () => {
    expect(validateTwilioSignature(URL, PARAMS, sign(URL, PARAMS, "wrong_token"))).toBe(false);
  });

  it("does not throw on mismatched-length input, returns false", () => {
    // timingSafeEqual throws a RangeError on unequal-length buffers; the length
    // guard must catch this before the compare.
    expect(() => validateTwilioSignature(URL, PARAMS, "short")).not.toThrow();
    expect(validateTwilioSignature(URL, PARAMS, "short")).toBe(false);
    expect(validateTwilioSignature(URL, PARAMS, "")).toBe(false);
  });

  it("rejects when the signed URL differs (replay to a different endpoint)", () => {
    const sig = sign(URL, PARAMS);
    expect(validateTwilioSignature("https://evil.example.com/hook", PARAMS, sig)).toBe(false);
  });
});
