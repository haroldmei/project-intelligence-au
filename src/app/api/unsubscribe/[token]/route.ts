// /api/unsubscribe/[token] — unauthenticated, token-based email opt-out.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Spam Act 2003 / Spam Regulations 2021: a functional unsubscribe honoured with
// NO login and NO fee. The HMAC token carries the userId, so no session is
// required. Opting out sets User.emailOptIn = false, which the MARKETING send
// path (weekly digest, storm brief) gates on. Transactional notices — the
// trial-ending charge reminder (issue #127) and the payment-failed dunning
// email — deliberately do NOT gate on this flag, so unsubscribing never silently
// suppresses a pre-charge warning.
//
// RFC-8058 (issue #179): the opt-out mutation happens ONLY on POST, never on a
// bare GET. Corporate link scanners and mail-client prefetch (Outlook SafeLinks,
// Mimecast, Gmail proxy) fire automated GETs against every link in delivered
// mail; a GET that flipped emailOptIn would silently unsubscribe paying
// subscribers. So:
//   • POST  → the mutation. Serves both the inbox one-click "Unsubscribe"
//             (List-Unsubscribe-Post: List-Unsubscribe=One-Click) and the
//             confirm button below.
//   • GET   → a harmless confirm interstitial whose button POSTs. Prefetch-safe.
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
      `<h1 style="font-size: 20px;">${title}</h1>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

const invalidLinkPage = () =>
  page(
    400,
    "Invalid unsubscribe link",
    `<p style="font-size: 15px; line-height: 1.5; color: #334E68;">This unsubscribe link is not valid. You can manage your email preferences from your <a href="${APP_BASE}/account">account settings</a>.</p>`,
  );

/**
 * GET is deliberately side-effect-free (RFC-8058 / issue #179). It renders a
 * confirm interstitial: the opt-out only happens when the user submits the form,
 * which POSTs. An automated prefetch GET therefore cannot unsubscribe anyone.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const validation = validateUnsubscribeToken(token);

  if (!validation.ok) {
    log.warn({ reason: validation.reason }, "[unsubscribe] invalid token (GET)");
    return invalidLinkPage();
  }

  const action = `${APP_BASE}/api/unsubscribe/${encodeURIComponent(token)}`;
  return page(
    200,
    "Unsubscribe from marketing emails?",
    `<p style="font-size: 15px; line-height: 1.5; color: #334E68;">Confirm to stop receiving the weekly Sydney roofing digest and other marketing emails from ProjectIntelligence. ` +
      `We'll still send essential account and billing notices — such as a reminder before your trial ends and your card is charged.</p>` +
      `<form method="POST" action="${action}" style="margin: 24px 0;">` +
      `<button type="submit" style="font-size: 15px; font-weight: 600; color: #FFFFFF; background-color: #1E3A5F; border: none; border-radius: 6px; padding: 12px 20px; cursor: pointer;">Unsubscribe</button>` +
      `</form>` +
      `<p style="font-size: 13px; color: #627D98;">Didn't mean to open this? Just close the tab — you're still subscribed.</p>`,
  );
}

/**
 * POST performs the opt-out. Reached by the inbox one-click unsubscribe
 * (List-Unsubscribe-Post) and by the confirm button above. The unguessable HMAC
 * token in the path is the authorization, so no session/CSRF token is needed.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const validation = validateUnsubscribeToken(token);

  if (!validation.ok) {
    log.warn({ reason: validation.reason }, "[unsubscribe] invalid token (POST)");
    return invalidLinkPage();
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
    `<p style="font-size: 15px; line-height: 1.5; color: #334E68;">You will no longer receive the weekly Sydney roofing digest or other marketing emails from ProjectIntelligence. ` +
      `We'll still send essential account and billing notices — such as a reminder before your trial ends and your card is charged. ` +
      `Changed your mind? You can re-enable email from your <a href="${APP_BASE}/account">account settings</a>.</p>`,
  );
}
