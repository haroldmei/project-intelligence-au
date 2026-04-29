// HMAC oracle helpers — issue forged tokens for adversarial replay/tamper tests.
// Mirrors the in-source canonical-JSON shape of src/lib/hmac/token.ts so we can
// generate tokens that bypass `issueFeedbackToken`'s now() clock.
import { createHmac } from "node:crypto";

export interface ForgePayload {
  userId: string;
  daId: string;
  vote: 1 | 0;
  issuedAt: number; // unix seconds
}

export function canonicalJson(p: ForgePayload): string {
  return JSON.stringify({
    userId: p.userId,
    daId: p.daId,
    vote: p.vote,
    issuedAt: p.issuedAt,
  });
}

/** Build a token signed with the supplied secret — even if it's the wrong one. */
export function forgeToken(payload: ForgePayload, secret: string): string {
  const data = canonicalJson(payload);
  const sig = createHmac("sha256", secret).update(data).digest("hex");
  const envelope = JSON.stringify({ payload, sig });
  return Buffer.from(envelope).toString("base64url");
}

/** Build a token whose payload was tampered AFTER signing. */
export function tamperPayloadAfterSign(
  origPayload: ForgePayload,
  newPayload: ForgePayload,
  secret: string,
): string {
  const sig = createHmac("sha256", secret).update(canonicalJson(origPayload)).digest("hex");
  // Replace payload but keep old signature
  const envelope = JSON.stringify({ payload: newPayload, sig });
  return Buffer.from(envelope).toString("base64url");
}
