// Sentry init for the Edge runtime (middleware, edge routes).
// Loaded by instrumentation.ts register() when NEXT_RUNTIME === "edge".
// Gated on SENTRY_DSN — see sentry.server.config.ts for the rationale.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.STAGE ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}
