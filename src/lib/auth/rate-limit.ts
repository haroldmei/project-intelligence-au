// Fixed-window in-memory rate limiter.
// contract.security.rate_limiting = required | cache.required = false (Redis deferred)
// system-design §6.4: in-memory token-bucket per route, per IP or user id.
//
// NOTE: This implementation is intentionally non-strict across Vercel serverless
// instances (each instance has its own Map). At preview tier (≤ 100 users) this
// is acceptable — argon2id work factor (~0.5s) is the primary brute-force deterrent.
// PRODUCTION SWAP: Replace the in-memory Map with a single Postgres row per
// (key, window_start) — upsert with an atomic counter column and an expiry check.
// Trigger: > 50 paid users OR observed brute-force attempt in Sentry logs.
// See system-design §6.4 for the Redis/Upstash alternative if latency matters.

interface WindowEntry {
  count: number;
  windowStart: number; // epoch ms
}

// key → { count, windowStart }
const store = new Map<string, WindowEntry>();

/** Prune entries older than 1 hour to prevent unbounded memory growth in dev. */
function pruneOld(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, entry] of store) {
    if (entry.windowStart < cutoff) store.delete(key);
  }
}

let pruneCounter = 0;
function maybePrune(): void {
  if (++pruneCounter % 500 === 0) pruneOld();
}

/**
 * Check whether a request is within the rate limit.
 *
 * @param key      Composite key, e.g. `ip:1.2.3.4:signup` or `user:abc123:otp`
 * @param limit    Max requests allowed in the window
 * @param windowMs Window duration in milliseconds
 * @returns { allowed: boolean; retryAfterSeconds: number }
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  maybePrune();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window — deny immediately if limit === 0 (kill-switch, AT-003).
    if (limit === 0) {
      store.set(key, { count: 1, windowStart: now });
      return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
    }
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    const retryAfterSeconds = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

// ── Preconfigured limits (system-design §6.4) ────────────────────────────────
// Default to 5/min/IP if a specific route is not listed.
// Assumption: 1 minute = 60_000ms; 1 hour = 3_600_000ms

/** 5 requests/min keyed by IP — for signup, login, password-reset/request. */
export function rateLimitByIp(
  ip: string,
  route: string
): ReturnType<typeof checkRateLimit> {
  return checkRateLimit(`ip:${ip}:${route}`, 5, 60_000);
}

/** 1 request/min keyed by account — for verify-email/resend. */
export function rateLimitResendByAccount(
  userId: string
): ReturnType<typeof checkRateLimit> {
  // Assumption: 1/min per account (system-design is silent; conservative default).
  return checkRateLimit(`account:${userId}:otp-resend`, 1, 60_000);
}

/**
 * Change pending email (issue #92) — 5 requests/hr keyed by account. Each call
 * writes a new address and dispatches an OTP to it, so a tighter cap than the
 * generic mutating limit blunts using the endpoint to email-bomb arbitrary
 * addresses. Independent of the 1/min resend budget.
 */
export function rateLimitChangeEmailByAccount(
  userId: string
): ReturnType<typeof checkRateLimit> {
  return checkRateLimit(`account:${userId}:change-email`, 5, 3_600_000);
}

/** 10 requests/hr keyed by user — for OTP verify. */
export function rateLimitOtpVerifyByUser(
  userId: string
): ReturnType<typeof checkRateLimit> {
  return checkRateLimit(`user:${userId}:otp-verify`, 10, 3_600_000);
}

/**
 * 10 requests/hr keyed by (normalized) email — for the session-less
 * password-reset confirm OTP check (issue #126). The reset flow has no logged-in
 * user, so the account is identified by the emailed address; keying on the email
 * bounds brute-force guesses against one account regardless of source IP
 * (proxy/botnet rotation). Applied BEFORE the user lookup so a real and an
 * unknown account behave identically (no email enumeration). Kept independent of
 * rateLimitOtpVerifyByUser so an email-verify burst can't exhaust a legitimate
 * reset's budget and vice-versa.
 */
export function rateLimitPasswordResetConfirmByEmail(
  email: string
): ReturnType<typeof checkRateLimit> {
  return checkRateLimit(`email:${email}:password-reset-confirm`, 10, 3_600_000);
}

/**
 * Per-user limit for cost-amplifying mutating endpoints. Each call may
 * trigger Stripe API requests (customer create, checkout session) or
 * OpenAI calls (saved-query embedding). 30/hr is generous for legitimate
 * use — a user clicking "checkout" once or twice is fine, but hammering
 * the route to spawn Stripe customers gets stopped. Use for billing,
 * portal, saved-query, lga-bundles, sms-opt-in/out routes.
 */
export function rateLimitMutatingByUser(
  userId: string,
  route: string,
): ReturnType<typeof checkRateLimit> {
  return checkRateLimit(`user:${userId}:${route}`, 30, 3_600_000);
}
