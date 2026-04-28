// OTP generation, storage, and consumption.
// contract.auth.mfa = email-otp-or-sms-otp
// System-design §6.1: email OTP, 6-digit, 15-minute expiry.
// The schema uses argon2id to hash the code before persisting (same lib as passwords.ts).
import crypto from "node:crypto";
import argon2 from "argon2";
import { db } from "@/lib/db";

const OTP_EXPIRY_MINUTES = 10; // system-design §6.1 (≤ 15 min)
const ARGON2_OPTS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/** Generate a cryptographically-random 6-digit code. */
export function generateOtpCode(): string {
  // Use rejection sampling to avoid modulo bias; max 10^6 = 1_000_000
  const max = 1_000_000;
  let n: number;
  do {
    const buf = crypto.randomBytes(4);
    n = buf.readUInt32BE(0);
  } while (n >= Math.floor(0xffffffff / max) * max);
  return String(n % max).padStart(6, "0");
}

/**
 * Create and persist an EmailOtp record.
 * Returns the plaintext code (to be sent via email — NOT stored).
 * Invalidates any prior unconsumed OTPs for the same user+purpose.
 */
export async function createOtp(
  userId: string,
  purpose: "verify" | "reset" | "login" = "verify"
): Promise<string> {
  const code = generateOtpCode();
  const codeHash = await argon2.hash(code, ARGON2_OPTS);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Consume any existing live OTPs for this user + purpose (prevent accumulation)
  await db.emailOtp.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await db.emailOtp.create({
    data: { userId, codeHash, expiresAt, purpose },
  });

  return code;
}

/**
 * Validate and consume an OTP.
 * Returns the matching EmailOtp userId on success, or null on any failure.
 * Safe against timing attacks: always runs argon2.verify before returning.
 */
export async function verifyAndConsumeOtp(
  userId: string,
  code: string,
  purpose: "verify" | "reset" | "login" = "verify"
): Promise<boolean> {
  const otp = await db.emailOtp.findFirst({
    where: {
      userId,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: "desc" },
  });

  if (!otp) return false;

  const valid = await argon2.verify(otp.codeHash, code, ARGON2_OPTS);
  if (!valid) return false;

  // Consume the OTP — idempotent via consumedAt timestamp
  await db.emailOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });

  return true;
}
