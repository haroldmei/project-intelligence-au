// Cron retry wrapper — system-design §7.3 NFR-022
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Wraps any async cron handler: catches, waits 15 minutes, retries once.
// On the second failure, rethrows so Vercel logs it and Sentry captures it.
// Preview tier: no BullMQ, no queue (contract.queue.engine: none).
import pino from "pino";
import { env } from "@/lib/env";

const log = pino({ name: "cron-retry" });

/**
 * Run `fn()`. If it throws, wait `delayMs` (default 15 min) then retry once.
 * The second failure is rethrown — caller/Vercel surfaces it.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { delayMs = 15 * 60 * 1000, label = "cron" }: { delayMs?: number; label?: string } = {},
): Promise<T> {
  try {
    return await fn();
  } catch (firstErr) {
    log.warn({ label, err: firstErr }, `[retry] ${label} failed — retrying in ${delayMs / 1000}s`);
    await delay(delayMs);
    try {
      return await fn();
    } catch (secondErr) {
      log.error({ label, err: secondErr }, `[retry] ${label} failed on retry — giving up`);
      throw secondErr;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Verify the Vercel Cron secret header. Returns 401 Response if invalid. */
export function verifyCronSecret(request: Request): Response | null {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  return null;
}
