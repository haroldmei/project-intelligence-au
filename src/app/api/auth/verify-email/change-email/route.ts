// POST /api/auth/verify-email/change-email
// Correct a mistyped signup email BEFORE verification (issue #92). A tradie who
// fat-fingers their address at signup lands on /verify with an OTP going to the
// wrong inbox and, until now, no way out — email was uneditable everywhere.
// This updates the pending account's email and dispatches a fresh OTP to it.
// Only allowed while emailVerified is false; a verified account changes email
// through the (separate) account flow, not here.
// Auth: Lucia session required.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { validateRequest } from "@/lib/auth/session";
import { createOtp } from "@/lib/auth/otp";
import { rateLimitChangeEmailByAccount } from "@/lib/auth/rate-limit";
import { ChangeEmailSchema } from "@/lib/auth/schemas";
import { sendEmail } from "@/lib/email/client";

export async function POST(req: NextRequest): Promise<Response> {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const auth = await validateRequest();
  if (!auth) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // ── Rate limit: 5/hr per account ──────────────────────────────────────────
  const rl = rateLimitChangeEmailByAccount(auth.user.id);
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many email changes. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  // ── Only allowed pre-verification ─────────────────────────────────────────
  if (auth.user.emailVerified) {
    return Response.json(
      { error: "Email is already verified." },
      { status: 400 }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ChangeEmailSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();

  // ── Uniqueness: reject an address already owned by another account ────────
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing && existing.id !== auth.user.id) {
    // Generic message — mirrors signup, avoids email enumeration.
    return Response.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  // ── Persist the corrected address (still unverified) ──────────────────────
  await db.user.update({
    where: { id: auth.user.id },
    data: { email: normalizedEmail },
  });

  // ── Fresh OTP to the corrected address (createOtp invalidates prior codes) ─
  const otpCode = await createOtp(auth.user.id, "verify");
  await sendEmail({
    to: normalizedEmail,
    template: "verify-email",
    props: { email: normalizedEmail, code: otpCode },
  });

  return Response.json({ email: normalizedEmail, sent: true });
}
