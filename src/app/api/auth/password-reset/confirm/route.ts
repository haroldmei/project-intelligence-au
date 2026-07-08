// POST /api/auth/password-reset/confirm
// Validates the reset OTP token + new password; argon2id hashes and persists.
// Invalidates all existing Lucia sessions on success (force re-login).
// contract.auth | system-design §6.1
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/passwords";
import { lucia } from "@/lib/auth/lucia";
import { verifyAndConsumeOtp } from "@/lib/auth/otp";
import {
  rateLimitByIp,
  rateLimitPasswordResetConfirmByEmail,
} from "@/lib/auth/rate-limit";
import { PasswordResetConfirmSchema } from "@/lib/auth/schemas";

function tooManyAttempts(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  // ── Rate limit: 5/min per IP ──────────────────────────────────────────────
  // The reset token is a 6-digit OTP (10^6 space, ~10-min window). Without a cap
  // an attacker who knows a victim's email could brute-force the live code and
  // take over the account (issue #126). Every sibling OTP path is throttled; this
  // one was missed. The IP cap blunts distributed guessing across many accounts;
  // the per-email cap below is the real per-account wall.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipRl = rateLimitByIp(ip, "password-reset-confirm");
  if (!ipRl.allowed) return tooManyAttempts(ipRl.retryAfterSeconds);

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PasswordResetConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { token, email, password } = parsed.data;

  // The token field carries the 6-digit OTP code in V1. The user is not logged
  // in during a reset, so `email` identifies the account for the OTP lookup.
  // Both arrive via the emailed reset link (see password-reset/request).
  // Token-only reset via signed URLs is a V2 flow.
  const normalizedEmail = email.toLowerCase().trim();

  // ── Rate limit: 10/hr per account ─────────────────────────────────────────
  // Keyed on the email and checked BEFORE the user lookup so a real and an
  // unknown account behave identically (no enumeration) while still bounding
  // guesses against any single address. This, plus the per-OTP failed-attempt
  // ceiling in verifyAndConsumeOtp, makes unbounded guessing impossible.
  const emailRl = rateLimitPasswordResetConfirmByEmail(normalizedEmail);
  if (!emailRl.allowed) return tooManyAttempts(emailRl.retryAfterSeconds);

  const user = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return Response.json({ error: "Invalid or expired reset token." }, { status: 400 });
  }

  // ── Verify and consume the reset OTP ─────────────────────────────────────
  const valid = await verifyAndConsumeOtp(user.id, token, "reset");
  if (!valid) {
    return Response.json({ error: "Invalid or expired reset token." }, { status: 400 });
  }

  // ── Hash new password ─────────────────────────────────────────────────────
  const passwordHash = await hashPassword(password);

  // ── Update password + invalidate all sessions (force re-login) ───────────
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  await lucia.invalidateUserSessions(user.id);

  return Response.json({ ok: true });
}
