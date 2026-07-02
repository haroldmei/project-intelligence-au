// Twilio SMS client wrapper.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// contract: email.sms_provider = twilio
//
// Preview tier: no-op when TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN unset.
// FR-011: top-3 DA cards delivered via Twilio; tap-to-open-portal links included.
// NFR-027: every SMS includes "Reply STOP to opt out"
import { createHmac } from "node:crypto";
import pino from "pino";
import { env } from "@/lib/env";

const log = pino({ name: "sms" });

interface SmsOptions {
  to: string; // E.164 format, e.g. +61400000000
  body: string;
}

// ─── Spam Act 2003 compliance (centralised) ──────────────────────────────────
// Every commercial SMS must (a) identify the sender and (b) carry a functional
// opt-out instruction. These live HERE — not at call sites — so no composition
// path (digest, trial reminder, future storm brief) can ship an SMS without
// them. `sendSms` runs `applyComplianceWrapping` over every outbound message.

/** Sender identification prefix required in every commercial SMS. */
export const SMS_SENDER_ID = "PI-AU";
/** Functional opt-out footer required in every commercial SMS. */
export const SMS_STOP_FOOTER = "Reply STOP to opt out.";

/**
 * Guarantee sender-id + STOP footer are present. Idempotent: a call site that
 * already includes them (to budget SMS character counts, e.g. the digest) is
 * left as-is; a call site that omits either gets it added automatically.
 */
export function applyComplianceWrapping(body: string): string {
  let out = body.trim();
  // Sender identification — ensure the message is attributable to PI-AU.
  if (!new RegExp(`(^|\\b)${SMS_SENDER_ID}\\b`).test(out)) {
    out = `${SMS_SENDER_ID} ${out}`;
  }
  // Functional opt-out — match any "reply stop" phrasing so we don't double it.
  if (!/reply\s+stop/i.test(out)) {
    out = `${out}\n${SMS_STOP_FOOTER}`;
  }
  return out;
}

/** Lazy twilio client singleton */
let _client: TwilioClient | null = null;

interface TwilioClient {
  messages: {
    create(opts: { body: string; from: string; to: string }): Promise<{ sid: string }>;
  };
}

function getClient(): TwilioClient | null {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  if (_client) return _client;
  // Dynamic import — twilio isn't in package.json yet; we use the REST API directly
  // to avoid adding the heavy twilio SDK at preview tier. Swap to `twilio` package at launch.
  _client = buildRestClient(sid, token);
  return _client;
}

function buildRestClient(sid: string, token: string): TwilioClient {
  const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  return {
    messages: {
      async create(opts) {
        const body = new URLSearchParams({
          Body: opts.body,
          From: opts.from,
          To: opts.to,
        });
        const res = await fetch(base, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`[sms] Twilio error ${res.status}: ${txt}`);
        }
        const data = (await res.json()) as { sid: string };
        return { sid: data.sid };
      },
    },
  };
}

/**
 * Send an SMS. Non-blocking on failure — email is the primary channel
 * (system-design §7.3 "Twilio SMS failure"). Returns true on success.
 */
export async function sendSms(opts: SmsOptions): Promise<boolean> {
  const client = getClient();
  if (!client) {
    log.debug({ to: opts.to }, "[DEV] SMS stub (TWILIO_* not set)");
    return false;
  }
  const from = env.TWILIO_PHONE_NUMBER;
  if (!from) {
    log.warn("TWILIO_PHONE_NUMBER not set — cannot send SMS");
    return false;
  }
  // Enforce sender-id + STOP footer on EVERY outbound SMS, regardless of what
  // the caller passed. This is the single choke point that makes the Spam Act
  // guarantee unbypassable.
  const body = applyComplianceWrapping(opts.body);
  try {
    const msg = await client.messages.create({ body, from, to: opts.to });
    log.info({ sid: msg.sid, to: opts.to }, "SMS sent");
    return true;
  } catch (err) {
    log.error({ err, to: opts.to }, "SMS send failed (non-blocking)");
    return false;
  }
}

/**
 * Validate a Twilio webhook request signature.
 * system-design §6 NFR-015: signature-validated webhooks.
 * Uses the X-Twilio-Signature header and TWILIO_AUTH_TOKEN.
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  const authToken = env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  // Twilio signature: HMAC-SHA1 over sorted param key=value pairs appended to URL
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  const data = url + sortedParams;
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  return expected === signature;
}
