// Client-side PostHog (posthog-js), gated on stored cookie consent.
//
// CLIENT-ONLY: reads process.env.NEXT_PUBLIC_* directly (Next inlines these at
// build time). It must NOT import @/lib/env, which throws in the browser.
//
// Consent contract (issue #17): ZERO capture before consent. The banner
// (cookie-consent.tsx) persists "accepted" | "rejected" to localStorage under
// COOKIE_CONSENT_KEY. `initAnalytics()` no-ops unless the key is present AND
// consent is "accepted"; until then posthog-js is never initialised, so it
// cannot set cookies or capture anything.
import posthog from "posthog-js";
import type { AnalyticsEventName, AnalyticsEventProperties } from "./events";

/** localStorage key the cookie banner writes and this module reads. */
export const COOKIE_CONSENT_KEY = "pi_cookie_consent";

let started = false;

/** True only when the user has explicitly accepted analytics cookies. */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted";
}

/**
 * Initialise posthog-js. Idempotent. No-op when:
 *  - not in a browser,
 *  - NEXT_PUBLIC_POSTHOG_KEY is unset (dev / self-host without analytics), or
 *  - the user has not accepted analytics cookies.
 * Safe to call on every mount and again the moment consent is granted.
 */
export function initAnalytics(): void {
  if (started || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // no-op without a key
  if (!hasAnalyticsConsent()) return; // no capture before consent
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    // Only build person profiles for identified users; anonymous marketing
    // pageviews stay person-less.
    person_profiles: "identified_only",
    capture_pageview: true,
    // Privacy: no autocapture of DOM text (could scrape DA payload on portal
    // pages). We instrument the events we want explicitly, server-side.
    autocapture: false,
  });
  started = true;
}

/** Associate the current browser with an internal user id. No-op before init. */
export function identifyUser(userId: string): void {
  if (!started) return;
  posthog.identify(userId);
}

/** Clear identity + local state (e.g. on logout). No-op before init. */
export function resetAnalytics(): void {
  if (!started) return;
  posthog.reset();
}

/**
 * Capture a client-side product event. No-op before `initAnalytics()`, which
 * itself no-ops until the user accepts analytics cookies — so this inherits the
 * consent gate for free: ZERO capture before consent. Typed against the shared
 * event catalogue so a wrong/PII property is a compile error at the call site.
 *
 * Server-side events use `captureServer` (./server); use this only for the few
 * interactions with no server round-trip (e.g. an external portal click-out).
 */
export function captureClient<E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsEventProperties[E],
): void {
  if (!started) return;
  posthog.capture(event, properties);
}
