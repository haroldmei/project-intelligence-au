// Guard: the deploy runbook's PostHog step must quote the SAME default host
// that env.ts actually applies when NEXT_PUBLIC_POSTHOG_HOST is unset (#169).
//
// The runbook previously listed `https://app.posthog.com` (the legacy dashboard
// host) as the "(default)", while the Zod schema defaults to the ingest host
// `https://us.i.posthog.com`. An operator following the runbook would point
// analytics at the wrong endpoint, sending events nowhere useful. This test
// reads the schema's real `.default(...)` and asserts the runbook quotes it, so
// the two can never silently diverge again. It greps both files (like the
// cron-schedule guards) rather than importing, since env.ts eagerly validates
// process.env at import time.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_PATH = path.resolve(ROOT, "src/lib/env.ts");
const RUNBOOK_PATH = path.resolve(ROOT, "docs/19-deploy-runbook.md");

/** The default env.ts applies when NEXT_PUBLIC_POSTHOG_HOST is unset. */
function schemaDefaultHost(): string {
  const src = readFileSync(ENV_PATH, "utf8");
  const m = src.match(
    /NEXT_PUBLIC_POSTHOG_HOST:[^\n]*\.default\(\s*"([^"]+)"\s*\)/,
  );
  if (!m) throw new Error("no .default() for NEXT_PUBLIC_POSTHOG_HOST in env.ts");
  return m[1];
}

describe("deploy runbook PostHog host default", () => {
  const runbook = readFileSync(RUNBOOK_PATH, "utf8");

  it("defaults NEXT_PUBLIC_POSTHOG_HOST to the ingest host in the schema", () => {
    expect(schemaDefaultHost()).toBe("https://us.i.posthog.com");
  });

  it("quotes the schema default as the runbook's documented default", () => {
    const host = schemaDefaultHost();
    const documented = new RegExp(
      String.raw`NEXT_PUBLIC_POSTHOG_HOST=${host.replace(/[.]/g, "\\.")}\b[^\n]*\(default`,
    );
    expect(runbook).toMatch(documented);
  });

  it("does not present app.posthog.com as the POSTHOG_HOST default", () => {
    const staleDefault = new RegExp(
      String.raw`NEXT_PUBLIC_POSTHOG_HOST=https://app\.posthog\.com[^\n]*\(default`,
    );
    expect(runbook).not.toMatch(staleDefault);
  });
});
