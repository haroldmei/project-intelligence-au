// Guard: the deploy runbook's cron inventory must stay in sync with the crons
// vercel.json actually registers (issue #203).
//
// The runbook previously listed only five of the seven registered crons —
// omitting `/api/cron/ingest-retry` (#125) and `/api/cron/verification-reminder`
// (FR-016) — and hardcoded "All five entries above", so an operator auditing
// registered crons or debugging a missing retry/reminder had no reference for
// two shipped jobs. This test reads vercel.json's crons array and asserts (1)
// every registered path appears in the runbook, and (2) no "<N> entries above"
// sentence states a count that disagrees with the number of registered crons.
// It greps the runbook (like the sibling cron-schedule guards) rather than
// importing, so config and doc can never silently diverge again.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VERCEL_PATH = path.resolve(ROOT, "vercel.json");
const RUNBOOK_PATH = path.resolve(ROOT, "docs/19-deploy-runbook.md");

interface VercelCron {
  path: string;
  schedule: string;
}

function cronPaths(): string[] {
  const cfg = JSON.parse(readFileSync(VERCEL_PATH, "utf8")) as {
    crons: VercelCron[];
  };
  return cfg.crons.map((c) => c.path);
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

describe("deploy runbook cron inventory", () => {
  const runbook = readFileSync(RUNBOOK_PATH, "utf8");
  const paths = cronPaths();

  it("lists every vercel.json cron path in the runbook", () => {
    for (const p of new Set(paths)) {
      expect(runbook, `runbook is missing cron ${p}`).toContain(p);
    }
  });

  it("states no cron entry count that disagrees with vercel.json", () => {
    // The Hobby-constraint note references "<N> entries above"; the number
    // immediately preceding "entries above" is the total-count claim.
    const re =
      /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+entr(?:y|ies)\s+above\b/gi;
    const counts: number[] = [];
    for (const m of runbook.matchAll(re)) {
      const tok = m[1].toLowerCase();
      counts.push(/^\d+$/.test(tok) ? Number(tok) : NUMBER_WORDS[tok]);
    }
    expect(
      counts.length,
      "expected an 'N entries above' count phrase in the runbook",
    ).toBeGreaterThan(0);
    for (const c of counts) {
      expect(
        c,
        `runbook states ${c} entries but vercel.json registers ${paths.length}`,
      ).toBe(paths.length);
    }
  });
});
