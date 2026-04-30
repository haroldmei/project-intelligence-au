// Unit tests for HMAC token issue/validate (no DB needed)
// system-design §6.3 NFR-016
import { describe, it, expect } from "vitest";
import { issueFeedbackToken, validateFeedbackToken } from "@/lib/hmac/token";

// FEEDBACK_HMAC_SECRET is set by __tests__/setup-env.ts before any module loads,
// so env.ts caches the same value the test uses below. The previous fixture
// reset process.env in beforeEach, which broke validation because env.ts
// snapshots at import time — the validator and the test ended up using
// different keys (test signed with the override; validator verified with the
// cached value), surfacing as "tampered" instead of "expired".
const TEST_HMAC_SECRET = process.env.FEEDBACK_HMAC_SECRET!;

describe("issueFeedbackToken / validateFeedbackToken", () => {
  it("round-trips a thumbs-up token", () => {
    const token = issueFeedbackToken("user-1", "da-abc", 1);
    const result = validateFeedbackToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.userId).toBe("user-1");
      expect(result.payload.daId).toBe("da-abc");
      expect(result.payload.vote).toBe(1);
    }
  });

  it("round-trips a thumbs-down token", () => {
    const token = issueFeedbackToken("user-2", "da-xyz", 0);
    const result = validateFeedbackToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.vote).toBe(0);
    }
  });

  it("rejects tampered tokens", () => {
    const token = issueFeedbackToken("user-1", "da-abc", 1);
    const tampered = token.slice(0, -4) + "xxxx";
    const result = validateFeedbackToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["tampered", "invalid"]).toContain(result.reason);
  });

  it("rejects expired tokens", () => {
    // Backdate issuedAt by 8 days
    const payload = {
      userId: "u1",
      daId: "da1",
      vote: 1 as const,
      issuedAt: Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60,
    };
    // Build the token manually (bypass issueFeedbackToken's now())
    const { createHmac } = require("node:crypto");
    const data = JSON.stringify(payload);
    const sig = createHmac("sha256", TEST_HMAC_SECRET).update(data).digest("hex");
    const envelope = JSON.stringify({ payload, sig });
    const token = Buffer.from(envelope).toString("base64url");

    const result = validateFeedbackToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects garbage input", () => {
    expect(validateFeedbackToken("not-valid-base64!!").ok).toBe(false);
    expect(validateFeedbackToken("").ok).toBe(false);
  });
});
