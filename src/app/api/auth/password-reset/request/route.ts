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
import { env } from "@/lib/env";

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

  // ── Create OTP with purpose='reset' (1-hour expiry per otp.ts) ───────────
  // system-design §6.1 / FR-017 mandate a 1-hour reset window; createOtp keys
  // the expiry off the purpose, so 'reset' codes live for 60 min.
  const resetCode = await createOtp(user.id, "reset");

  // ── Send password reset email ──────────────────────────────────────────────
  // Link back to the /reset page with the OTP + email so the confirm hop can
  // resolve the (session-less) account. Both are also shown as a fallback code.
  const resetUrl =
    `${env.NEXT_PUBLIC_APP_URL}/reset` +
    `?token=${encodeURIComponent(resetCode)}` +
    `&email=${encodeURIComponent(normalizedEmail)}`;
  await sendEmail({
    to: normalizedEmail,
    template: "password-reset",
    props: { email: normalizedEmail, code: resetCode, resetUrl },
  });

  return Response.json({ ok: true });
}
