// Next.js instrumentation hook — the server/edge entry point Sentry needs.
// Without this file (and the sentry.*.config.ts it loads) every
// Sentry.captureException across the backend is a silent no-op because
// Sentry was never initialised (issue #96 C1).
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Report React Server Component / route-handler render errors to Sentry.
export const onRequestError = Sentry.captureRequestError;
