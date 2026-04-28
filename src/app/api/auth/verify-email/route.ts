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

  return Response.json({ verified: true });
}
