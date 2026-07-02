// Unit tests for the unauthenticated email-unsubscribe token (no DB needed).
// Spam Act 2003: the unsubscribe link must work with no login and stay valid
// indefinitely. Same HMAC pattern as the thumbs feedback links (issue #23).
import { describe, it, expect } from "vitest";
import {
  issueUnsubscribeToken,
  validateUnsubscribeToken,
  issueFeedbackToken,
} from "@/lib/hmac/token";

describe("issueUnsubscribeToken / validateUnsubscribeToken", () => {
  it("round-trips a token and recovers the userId", () => {
    const token = issueUnsubscribeToken("user-42");
    const result = validateUnsubscribeToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe("user-42");
  });

  it("rejects a tampered signature", () => {
    const token = issueUnsubscribeToken("user-42");
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    decoded.payload.userId = "attacker"; // change payload, keep old sig
    const forged = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    const result = validateUnsubscribeToken(forged);
    expect(result.ok).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(validateUnsubscribeToken("not-a-real-token").ok).toBe(false);
    expect(validateUnsubscribeToken("").ok).toBe(false);
  });

  it("does not accept a feedback token as an unsubscribe token (domain separation)", () => {
    const feedbackToken = issueFeedbackToken("user-42", "da-1", 1);
    const result = validateUnsubscribeToken(feedbackToken);
    expect(result.ok).toBe(false);
  });
});
