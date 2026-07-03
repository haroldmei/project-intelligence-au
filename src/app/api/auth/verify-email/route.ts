// POST /api/auth/verify-email
// Validates the 6-digit OTP emailed at signup; marks user.emailVerified = true.
// contract.auth.mfa = email-otp | system-design §6.1
// Auth: Lucia session required (user must be logged in to verify)
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { validateRequest } from "@/lib/auth/session";
import { verifyAndConsumeOtp } from "@/lib/auth/otp";
import { rateLimitOtpVerifyByUser } from "@/lib/auth/rate-limit";
import { OtpVerifySchema } from "@/lib/auth/schemas";
import { captureServer } from "@/lib/analytics/server";
import { sendEmail } from "@/lib/email/client";
import { env } from "@/lib/env";
import pino from "pino";

const log = pino({ name: "verify-email" });

/** Best-effort friendly first name from the email local-part (no name field
 *  exists on User). "jane.smith@x.com" → "Jane". Falls back to "there". */
function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const token = local.split(/[.\-_+]/)[0] ?? "";
  if (!token) return "there";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export async function POST(req: NextRequest): Promise<Response> {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const auth = await validateRequest();
  if (!auth) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // ── Rate limit: 10/hr per user ────────────────────────────────────────────
  const rl = rateLimitOtpVerifyByUser(auth.user.id);
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many OTP attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = OtpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  // ── Verify and consume OTP ────────────────────────────────────────────────
  const valid = await verifyAndConsumeOtp(auth.user.id, parsed.data.code, "verify");
  if (!valid) {
    return Response.json(
      { error: "Invalid or expired OTP code." },
      { status: 400 }
    );
  }

  // ── Mark email verified ───────────────────────────────────────────────────
  await db.user.update({
    where: { id: auth.user.id },
    data: { emailVerified: true },
  });

  captureServer(auth.user.id, "email_verified", {});

  // Welcome + next-step nudge (issue #96 A2): the template was registered but
  // never dispatched. Fire it here — best-effort, so a mail hiccup never fails
  // an otherwise-successful verification. sendEmail no-ops when RESEND_API_KEY
  // is unset (dev/test).
  try {
    await sendEmail({
      to: auth.user.email,
      template: "welcome-after-verify",
      props: {
        firstName: firstNameFromEmail(auth.user.email),
        lgaSetupUrl: `${env.NEXT_PUBLIC_APP_URL}/onboarding/area`,
      },
    });
  } catch (err) {
    log.error({ userId: auth.user.id, err }, "[verify-email] welcome email send failed (non-fatal)");
  }

  return Response.json({ verified: true });
}
