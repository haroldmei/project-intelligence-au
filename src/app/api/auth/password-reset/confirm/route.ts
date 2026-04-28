// POST /api/auth/password-reset/confirm
// Validates the reset OTP token + new password; argon2id hashes and persists.
// Invalidates all existing Lucia sessions on success (force re-login).
// contract.auth | system-design §6.1
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/passwords";
import { lucia } from "@/lib/auth/lucia";
import { verifyAndConsumeOtp } from "@/lib/auth/otp";
import { PasswordResetConfirmSchema } from "@/lib/auth/schemas";

export async function POST(req: NextRequest): Promise<Response> {
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

  const { token, password } = parsed.data;

  // The token field carries the 6-digit OTP code in V1.
  // The caller gets this from the email; it is 6 digits, numeric.
  // To identify the user, the caller must also pass their email (added below).
  // ── We need the email to identify the user for the OTP lookup ─────────────
  // Re-parse to include email (token-only reset is a V2 flow with signed URLs).
  // For V1: token is the 6-digit code + email is required to identify account.
  // This is consistent with how verify-email works (session provides the userId).
  // HOWEVER, on a reset flow, the user is NOT logged in, so we need email here.
  // Re-validate body with email included.

  // NOTE: The PasswordResetConfirmSchema only has { token, password }.
  // We need the email to resolve the user without a session.
  // Parse email out directly.
  const rawBody = body as Record<string, unknown>;
  const email = typeof rawBody.email === "string" ? rawBody.email.toLowerCase().trim() : null;
  if (!email) {
    return Response.json({ error: "Email is required for password reset confirmation." }, { status: 422 });
  }

  const user = await db.user.findUnique({ where: { email } });
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
