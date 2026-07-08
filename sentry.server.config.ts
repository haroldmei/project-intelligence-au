// Sentry init for the Node.js server runtime (API routes, crons, RSC).
// Loaded by instrumentation.ts register() when NEXT_RUNTIME === "nodejs".
//
// Gated on SENTRY_DSN: with no DSN, Sentry.init is skipped and every
// Sentry.captureException/captureMessage call across the backend (stripe
// webhook, digest assemble/cron, ingest, pcc-ingest, relevance run) is a
// harmless no-op. This file is what makes those captures actually report.
// Reads process.env directly rather than @/lib/env so the schema module
// isn't pulled into the instrumentation bundle.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.STAGE ?? process.env.NODE_ENV,
    // Errors-first: this product's captures are exceptions and cost/SLA
    // messages, not perf spans. Keep tracing off until there's a reason.
    tracesSampleRate: 0,
  });
}
