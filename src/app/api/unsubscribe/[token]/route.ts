// GET /api/unsubscribe/[token] — unauthenticated, token-based email opt-out.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Spam Act 2003 / Spam Regulations 2021: a functional unsubscribe honoured
// with NO login and NO fee. Same HMAC pattern as the thumbs feedback links
// (src/app/api/feedback/[token]/route.ts) — the token carries the userId, so
// no session is required. Sets User.emailOptIn = false, which the MARKETING
// send path (the weekly digest) gates on. Transactional notices — the
// trial-ending charge reminder (issue #127) and the payment-failed dunning
// email — deliberately do NOT gate on this flag, so unsubscribing never
// silently suppresses a pre-charge warning.
import { validateUnsubscribeToken } from "@/lib/hmac/token";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import pino from "pino";

const log = pino({ name: "unsubscribe-token" });
const APP_BASE = env.NEXT_PUBLIC_APP_URL;

export const runtime = "nodejs";

function page(status: number, title: string, body: string): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title}</title></head>` +
      `<body style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 48px auto; padding: 0 16px; color: #1E3A5F;">` +
      `<h1 style="font-size: 20px;">${title}</h1><p style="font-size: 15px; line-height: 1.5; color: #334E68;">${body}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const validation = validateUnsubscribeToken(token);

  if (!validation.ok) {
    log.warn({ reason: validation.reason }, "[unsubscribe] invalid token");
    return page(
      400,
      "Invalid unsubscribe link",
      `This unsubscribe link is not valid. You can manage your email preferences from your <a href="${APP_BASE}/account">account settings</a>.`,
    );
  }

  // updateMany (not update) so an already-deleted user doesn't throw P2025 —
  // the endpoint stays idempotent and always returns a friendly page.
  const result = await db.user.updateMany({
    where: { id: validation.userId },
    data: { emailOptIn: false },
  });
  log.info({ userId: validation.userId, updated: result.count }, "[unsubscribe] email opt-out");

  return page(
    200,
    "You've been unsubscribed",
    `You will no longer receive the weekly Sydney roofing digest or other marketing emails from ProjectIntelligence. ` +
      `We'll still send essential account and billing notices — such as a reminder before your trial ends and your card is charged. ` +
      `Changed your mind? You can re-enable email from your <a href="${APP_BASE}/account">account settings</a>.`,
  );
}
