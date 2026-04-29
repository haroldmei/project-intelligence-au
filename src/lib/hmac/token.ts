// HMAC feedback token — system-design §6.3 NFR-016
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Token structure (base64url-encoded JSON):
//   { userId, daId, vote: 1|0, issuedAt: unix-seconds }
// Signed with HMAC-SHA-256 over the canonical JSON using FEEDBACK_HMAC_SECRET.
// 7-day expiry window (system-design §6.3 NFR-016).
// Replay window: we do NOT store used tokens (preview tier, no Redis);
// email HMAC links are idempotent — submitting the same feedback twice just upserts.
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const WINDOW_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface FeedbackTokenPayload {
  userId: string;
  daId: string;
  /** 1 = thumbs up, 0 = thumbs down */
  vote: 1 | 0;
  issuedAt: number; // unix seconds
}

function canonical(payload: FeedbackTokenPayload): string {
  return JSON.stringify({
    userId: payload.userId,
    daId: payload.daId,
    vote: payload.vote,
    issuedAt: payload.issuedAt,
  });
}

function sign(data: string): string {
  return createHmac("sha256", env.FEEDBACK_HMAC_SECRET).update(data).digest("hex");
}

/**
 * Issue a signed feedback token for a DA card in an email.
 * Returns a base64url-encoded string to embed in the ?token= query param.
 */
export function issueFeedbackToken(
  userId: string,
  daId: string,
  vote: 1 | 0,
): string {
  const payload: FeedbackTokenPayload = {
    userId,
    daId,
    vote,
    issuedAt: Math.floor(Date.now() / 1000),
  };
  const data = canonical(payload);
  const sig = sign(data);
  const envelope = JSON.stringify({ payload, sig });
  return Buffer.from(envelope).toString("base64url");
}

export type TokenValidation =
  | { ok: true; payload: FeedbackTokenPayload }
  | { ok: false; reason: "invalid" | "expired" | "tampered" };

/**
 * Validate a feedback token from a query param. Returns the payload on
 * success; a typed error on failure (never throws).
 */
export function validateFeedbackToken(raw: string): TokenValidation {
  let envelope: { payload: FeedbackTokenPayload; sig: string };
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    envelope = JSON.parse(decoded);
    if (!envelope?.payload || !envelope?.sig) return { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const { payload, sig } = envelope;
  const expectedSig = sign(canonical(payload));
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return { ok: false, reason: "tampered" };
  if (!timingSafeEqual(sigBuf, expectedBuf)) return { ok: false, reason: "tampered" };

  const nowSec = Math.floor(Date.now() / 1000);
  // Reject tokens with a future issuedAt beyond 60-second clock-skew tolerance (AT-002).
  const CLOCK_SKEW_TOLERANCE = 60;
  if (payload.issuedAt > nowSec + CLOCK_SKEW_TOLERANCE) {
    return { ok: false, reason: "invalid" };
  }
  const age = nowSec - payload.issuedAt;
  if (age > WINDOW_SECONDS) return { ok: false, reason: "expired" };

  return { ok: true, payload };
}
