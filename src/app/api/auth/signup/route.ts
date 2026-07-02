// POST /api/auth/signup
// contract.auth: lucia + argon2id + email-otp
// system-design §4 (API table): 5/IP/min rate limit
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/auth/passwords";
import { lucia } from "@/lib/auth/lucia";
import { createOtp } from "@/lib/auth/otp";
import { rateLimitByIp } from "@/lib/auth/rate-limit";
import { serializeLuciaCookie } from "@/lib/auth/session";
import { SignupSchema } from "@/lib/auth/schemas";
import { sendEmail } from "@/lib/email/client";
import { captureServer } from "@/lib/analytics/server";

// E2E auto-verification bypass: test-mode Stripe + emails on the .test
// reserved-TLD subdomain we own. Disappears the moment STRIPE_SECRET_KEY
// is flipped to sk_live_, so it cannot survive into a real launch.
const E2E_EMAIL_DOMAIN = /@e2e\.test\.pi-au\.com$/i;
function isE2EAutoVerifyEmail(email: string): boolean {
  if (!env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return false;
  return E2E_EMAIL_DOMAIN.test(email);
}

export async function POST(req: NextRequest): Promise<Response> {
  // ── Rate limit: 5/min per IP ─────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimitByIp(ip, "signup");
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { email, password, mobile_e164 } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // ── Check email uniqueness ────────────────────────────────────────────────
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    // Return generic message to avoid email enumeration
    return Response.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  // ── Hash password ─────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(password);

  const autoVerify = isE2EAutoVerifyEmail(normalizedEmail);

  // ── Create user (trade locked to 'roofing' — V1 wedge constraint) ─────────
  const user = await db.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      mobile_e164,
      trade: "roofing",
      subscriptionStatus: "trial",
      emailVerified: autoVerify,
    },
  });

  // Analytics: account created + 28-day trial begins at signup (issue #17).
  captureServer(user.id, "signup_started", {});
  captureServer(user.id, "trial_started", { source: "signup" });

  // ── Create Lucia session ──────────────────────────────────────────────────
  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);

  if (!autoVerify) {
    const otpCode = await createOtp(user.id, "verify");
    await sendEmail({
      to: normalizedEmail,
      template: "verify-email",
      props: { email: normalizedEmail, code: otpCode },
    });
  }

  return Response.json(
    {
      userId: user.id,
      otpDispatched: !autoVerify,
      nextStep: autoVerify ? "/onboarding/area" : "/verify",
    },
    {
      status: 201,
      headers: {
        "Set-Cookie": serializeLuciaCookie(sessionCookie),
      },
    }
  );
}
