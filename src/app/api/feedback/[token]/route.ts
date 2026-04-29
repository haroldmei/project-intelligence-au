// GET /api/feedback/[token] — HMAC-signed email link feedback tap
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-023 | system-design §6.3 NFR-016 — HMAC token, 7-day expiry
//
// On success: records feedback, redirects to portal with ?feedback=recorded toast.
// On failure: returns plain HTML "link expired — view in portal" (system-design §7.3).
import { NextResponse } from "next/server";
import { validateFeedbackToken } from "@/lib/hmac/token";
import { recordFeedback } from "@/modules/feedback/service";
import { env } from "@/lib/env";
import pino from "pino";

const log = pino({ name: "feedback-token" });
const APP_BASE = env.NEXT_PUBLIC_APP_URL;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse | Response> {
  const { token } = await params;
  const validation = validateFeedbackToken(token);

  if (!validation.ok) {
    const reason = validation.reason;
    log.warn({ reason }, "[feedback-token] invalid token");
    if (reason === "expired") {
      return new Response(
        `<!DOCTYPE html><html><body><p>This feedback link has expired. <a href="${APP_BASE}/portal">View your digests in the portal</a>.</p></body></html>`,
        { status: 410, headers: { "Content-Type": "text/html" } },
      );
    }
    return new Response(
      `<!DOCTYPE html><html><body><p>Invalid feedback link. <a href="${APP_BASE}/portal">View your digests in the portal</a>.</p></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html" } },
    );
  }

  const { userId, daId, vote } = validation.payload;
  const feedbackVote = vote === 1 ? "up" : "down";

  try {
    await recordFeedback(userId, daId, feedbackVote, "email");
    log.info({ userId, daId, vote: feedbackVote }, "[feedback-token] recorded");
  } catch (err) {
    log.error({ userId, daId, err }, "[feedback-token] record failed");
    // Still redirect — user tapped, show them the portal
  }

  // Redirect to portal with toast query param
  const redirectUrl = `${APP_BASE}/portal?feedback=recorded&daId=${encodeURIComponent(daId)}&vote=${feedbackVote}`;
  return NextResponse.redirect(redirectUrl, 302);
}
