// Sentry init for the browser. Next.js 15.3+ auto-loads this file for the
// client bundle (replaces the legacy sentry.client.config.ts).
// Gated on NEXT_PUBLIC_SENTRY_DSN — no DSN, no init, captures stay no-ops.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_STAGE ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}
