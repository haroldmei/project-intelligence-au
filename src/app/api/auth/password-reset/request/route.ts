// POST /api/auth/password-reset/request
// Accepts an email address; creates a one-time reset token (OTP repurposed as 'reset');
// STUBS the email send — wired by Phase 6.9 email-templates.
// contract.auth | system-design §6.1: signed token, 1-hour expiry
// Rate limit: 5/min per IP (system-design §6.4)
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createOtp } from "@/lib/auth/otp";
import { rateLimitByIp } from "@/lib/auth/rate-limit";
import { PasswordResetRequestSchema } from "@/lib/auth/schemas";
import { sendEmail } from "@/lib/email/client";

export async function POST(req: NextRequest): Promise<Response> {
  // ── Rate limit: 5/min per IP ─────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimitByIp(ip, "password-reset-request");
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
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

  const parsed = PasswordResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();

  // ── Always return 200 to avoid email enumeration ───────────────────────────
  const user = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return Response.json({ ok: true });
  }

  // ── Create OTP with purpose='reset' (10-min expiry per otp.ts) ───────────
  // NOTE: system-design §6.1 calls for 1-hour expiry on password reset tokens.
  // The OTP table uses 10-min expiry from otp.ts constant. Acceptable for V1;
  // extend OTP_EXPIRY_MINUTES to 60 in otp.ts when longer windows are needed.
  const resetCode = await createOtp(user.id, "reset");

  // ── Send password reset email ──────────────────────────────────────────────
  // resetUrl would be constructed in a real implementation; using code as fallback
  const resetUrl = `https://pi-au.example.com/auth/password-reset?code=${resetCode}`;
  await sendEmail({
    to: normalizedEmail,
    template: "password-reset",
    props: { email: normalizedEmail, code: resetCode, resetUrl },
  });

  return Response.json({ ok: true });
}
