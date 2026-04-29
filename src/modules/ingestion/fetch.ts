// Polite fetch helper — robots-aware, retry with exponential backoff.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// contract: security.public_data_only = true — NO scraping of Cordell/LeadManager/EstimateOne.
// Only NSW Planning Portal API + DA Leads / Council DA public endpoints.
import pino from "pino";

const log = pino({ name: "ingestion-fetch" });

/** Max retries (not counting the initial attempt) */
const MAX_RETRIES = 3;
/** Base delay in ms for exponential backoff */
const BASE_DELAY_MS = 2_000;
/** Polite delay between outbound requests (robots-aware rate limiting) */
const INTER_REQUEST_DELAY_MS = 500;

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Fetch JSON from a public DA API endpoint with retry + exponential backoff.
 * Logs each attempt; throws after MAX_RETRIES exhausted.
 */
export async function fetchWithRetry<T>(
  url: string,
  opts: FetchOptions = {},
): Promise<T> {
  const { headers = {}, timeoutMs = 30_000 } = opts;
  let lastErr: Error = new Error("unknown");
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1);
      log.info({ attempt, delayMs, url }, "[fetch] retrying after backoff");
      await sleep(delayMs);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "ProjectIntelligence-AU/1.0 (+https://pi-au.example.com/bot)",
          Accept: "application/json",
          ...headers,
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      log.warn({ attempt, url, err: lastErr.message }, "[fetch] request failed");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr;
}

/** Polite inter-request delay (robots-aware). Call between API requests. */
export function politeDelay(): Promise<void> {
  return sleep(INTER_REQUEST_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
