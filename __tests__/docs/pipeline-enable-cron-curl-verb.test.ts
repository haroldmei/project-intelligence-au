// Guard: every manual-trigger curl in the pipeline-enable runbook (docs/22) must
// use the SAME HTTP verb that the target cron route actually exports (issue #129).
//
// The runbook is the one documented way to fire a cron endpoint by hand for
// testing/recovery. It previously did `curl -X POST .../api/cron/digest` (and the
// same for /api/cron/ingest), but both handlers export ONLY `GET` (Vercel Cron
// issues GET). An operator running the runbook verbatim got 405 Method Not
// Allowed and could conclude the digest was broken, delaying a Sunday send.
//
// This test extracts every `curl ... /api/cron/<name>` in docs/22, reads the
// verb, and asserts the corresponding route handler exports that method — so the
// runbook and the handlers can never silently diverge again.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const RUNBOOK_PATH = path.resolve(process.cwd(), "docs/22-pipeline-enable.md");

interface CurlTarget {
  route: string; // e.g. "digest"
  verb: string; // explicit -X verb, or "GET" when omitted (curl's default)
}

// Match a curl invocation hitting /api/cron/<route>, capturing an optional
// `-X <VERB>` anywhere in the command.
function extractCronCurls(md: string): CurlTarget[] {
  const targets: CurlTarget[] = [];
  // Join shell line-continuations so a curl split across `\`+newline is one line.
  const joined = md.replace(/\\\n\s*/g, " ");
  const curlLine = /curl\b[^\n]*\/api\/cron\/([a-z-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = curlLine.exec(joined)) !== null) {
    const command = m[0];
    const route = m[1];
    const verbMatch = /-X\s+([A-Z]+)/.exec(command);
    targets.push({ route, verb: verbMatch ? verbMatch[1] : "GET" });
  }
  return targets;
}

function exportedMethods(route: string): string[] {
  const routePath = path.resolve(
    process.cwd(),
    `src/app/api/cron/${route}/route.ts`,
  );
  const src = readFileSync(routePath, "utf8");
  const methods: string[] = [];
  const rx = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(src)) !== null) methods.push(m[1]);
  return methods;
}

describe("pipeline-enable runbook cron curl verbs", () => {
  const md = readFileSync(RUNBOOK_PATH, "utf8");
  const curls = extractCronCurls(md);

  it("documents at least one manual cron trigger", () => {
    expect(curls.length).toBeGreaterThan(0);
  });

  it.each(curls)(
    "curl to /api/cron/$route uses a verb the handler exports ($verb)",
    ({ route, verb }) => {
      const methods = exportedMethods(route);
      expect(methods).toContain(verb);
    },
  );
});
