// POST /api/auth/verify-email/resend
// Resend the email OTP; throttled to 1/min per account.
// Assumption: 1/min per account (system-design §6.4 is silent; conservative default).
// Auth: Lucia session required.
import { NextRequest } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { createOtp } from "@/lib/auth/otp";
import { rateLimitResendByAccount } from "@/lib/auth/rate-limit";
import { sendEmail } from "@/lib/email/client";

export async function POST(_req: NextRequest): Promise<Response> {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const auth = await validateRequest();
  if (!auth) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // ── Rate limit: 1/min per account ─────────────────────────────────────────
  const rl = rateLimitResendByAccount(auth.user.id);
  if (!rl.allowed) {
    return Response.json(
      { error: "Please wait before requesting another OTP." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  // ── Skip if already verified ──────────────────────────────────────────────
  if (auth.user.emailVerified) {
    return Response.json({ error: "Email is already verified." }, { status: 400 });
  }

  // ── Create new OTP (invalidates prior OTPs in createOtp) ─────────────────
  const otpCode = await createOtp(auth.user.id, "verify");

  // ── Send verification email ────────────────────────────────────────────────
  await sendEmail({
    to: auth.user.email,
    template: "verify-email",
    props: { email: auth.user.email, code: otpCode },
  });

  return Response.json({ sent: true });
}
