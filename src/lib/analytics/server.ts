// Server-side PostHog capture (posthog-node).
// No-op (dev/test) when NEXT_PUBLIC_POSTHOG_KEY is unset — same convention as
// the Resend (email/client.ts) and Twilio (sms/client.ts) wrappers: a
// module-level nullable client, resolved once, guarded at every call site.
//
// SERVER-ONLY: imports @/lib/env (which throws in the browser). Never import
// from a client component — the browser SDK lives in ./browser.ts.
//
// Server events are first-party and cookieless: they identify by internal user
// id (never email / DA text) and so are independent of the browser cookie
// consent banner, which gates only the client-side SDK.
import { PostHog } from "posthog-node";
import pino from "pino";
import { env } from "@/lib/env";
import type { AnalyticsEventName, AnalyticsEventProperties } from "./events";

const log = pino({ name: "analytics" });

let _client: PostHog | null = null;
let _resolved = false;

/** Lazily construct the posthog-node client; returns null when the key is unset. */
function getClient(): PostHog | null {
  if (_resolved) return _client;
  _resolved = true;
  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return (_client = null);
  _client = new PostHog(key, {
    host: env.NEXT_PUBLIC_POSTHOG_HOST,
    // Serverless: flush each event promptly rather than waiting for a batch
    // window the function lifetime may never reach.
    flushAt: 1,
    flushInterval: 0,
  });
  return _client;
}

function emit(
  distinctId: string,
  event: AnalyticsEventName,
  properties: Record<string, unknown>,
): void {
  const client = getClient();
  if (!client) {
    log.debug({ event }, "[analytics] stub — NEXT_PUBLIC_POSTHOG_KEY unset, not capturing");
    return;
  }
  try {
    client.capture({ distinctId, event, properties });
  } catch (err) {
    // Analytics must never break a request — swallow and log.
    log.warn({ err, event }, "[analytics] capture failed (non-blocking)");
  }
}

/**
 * Capture a product event for a known user, keyed by internal user id.
 * Typed against the event catalogue so a wrong/PII property is a compile error.
 */
export function captureServer<E extends AnalyticsEventName>(
  userId: string,
  event: E,
  properties: AnalyticsEventProperties[E],
): void {
  emit(userId, event, { ...properties });
}

/**
 * Capture a cookieless event with no known user (e.g. an SMS short-link
 * redirect resolved by someone who never had a browser session). Does NOT
 * create or update a PostHog person profile.
 */
export function captureAnonymous<E extends AnalyticsEventName>(
  distinctId: string,
  event: E,
  properties: AnalyticsEventProperties[E],
): void {
  emit(distinctId, event, { ...properties, $process_person_profile: false });
}

/** Flush + close the client (best-effort; used by long-lived scripts/tests). */
export async function shutdownAnalytics(): Promise<void> {
  if (_client) await _client.shutdown();
}
