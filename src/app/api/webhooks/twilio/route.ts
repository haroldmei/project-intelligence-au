// POST /api/webhooks/twilio — STOP keyword handler
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-029 | system-design §2 webhooks + §4 API design
//
// Validates Twilio request signature, handles STOP keyword → sets User.smsOptIn = false.
// Returns TwiML <Response/> (empty — no reply SMS on STOP, Twilio handles the regulatory message).
// NFR-027: Twilio handles STOP regulatory compliance (carrier-level opt-out).
import { db } from "@/lib/db";
import { validateTwilioSignature } from "@/lib/sms/client";
import { env } from "@/lib/env";
import pino from "pino";

const log = pino({ name: "webhook-twilio" });

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody)) {
    params[k] = v;
  }

  // Validate Twilio signature (NFR-015). In production, refuse the request
  // if TWILIO_AUTH_TOKEN isn't set — without it any HTTP POST could opt
  // users out of SMS. In dev/preview, log a warning and accept (so local
  // testing without Twilio doesn't break).
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`;
  const isProd = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";

  if (env.TWILIO_AUTH_TOKEN) {
    const valid = validateTwilioSignature(url, params, signature);
    if (!valid) {
      log.warn("[webhook-twilio] invalid Twilio signature");
      return new Response("<Response/>", { status: 403, headers: { "Content-Type": "text/xml" } });
    }
  } else if (isProd) {
    log.error("[webhook-twilio] TWILIO_AUTH_TOKEN unset in production — refusing request");
    return new Response("<Response/>", { status: 503, headers: { "Content-Type": "text/xml" } });
  } else {
    log.warn("[webhook-twilio] TWILIO_AUTH_TOKEN unset (dev mode) — skipping signature check");
  }

  const body = (params["Body"] ?? "").trim().toUpperCase();
  const from = params["From"]; // E.164 sender mobile number

  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(body)) {
    if (from) {
      const updated = await db.user.updateMany({
        where: { mobile_e164: from },
        data: { smsOptIn: false },
      });
      log.info({ from, body, updated: updated.count }, "[webhook-twilio] STOP processed");
    }
  }

  // Empty TwiML response — Twilio sends its own STOP confirmation message
  return new Response("<Response/>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
