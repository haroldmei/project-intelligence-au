// Guard: the storm-brief route handler's doc comment must quote the SAME cron
// schedule that vercel.json actually registers (issue #90).
//
// The handler comment is the first thing a developer reads when touching the
// endpoint. It previously asserted `0 */3 * * *` (every 3 hours) — a schedule
// that has not been deployed since the Hobby-plan daily cap (#84) forced
// `0 20 * * *`. That stale copy contradicted both vercel.json and
// src/modules/weather/cron.ts, misleading anyone reasoning about brief cadence.
// This test greps both files and asserts the quoted schedule equals the
// registered one, so the two can never silently diverge again.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROUTE_PATH = path.resolve(
  process.cwd(),
  "src/app/api/cron/storm-brief/route.ts",
);
const VERCEL_PATH = path.resolve(process.cwd(), "vercel.json");

interface VercelCron {
  path: string;
  schedule: string;
}

function registeredStormBriefSchedule(): string {
  const cfg = JSON.parse(readFileSync(VERCEL_PATH, "utf8")) as {
    crons: VercelCron[];
  };
  const entry = cfg.crons.find((c) => c.path === "/api/cron/storm-brief");
  if (!entry) throw new Error("no storm-brief cron in vercel.json");
  return entry.schedule;
}

describe("storm-brief route doc comment cron schedule", () => {
  const route = readFileSync(ROUTE_PATH, "utf8");
  const registered = registeredStormBriefSchedule();

  it("registers the storm-brief cron in vercel.json", () => {
    expect(registered).toBe("0 20 * * *");
  });

  it("quotes the registered schedule in the handler comment", () => {
    expect(route).toContain(`"${registered}"`);
  });

  it("does not present the retired 3-hourly schedule as active", () => {
    // `0 */3 * * *` may only survive as the *intended* (aspirational) cadence,
    // never quoted as the live vercel.json schedule.
    const staleAsActive = new RegExp(
      String.raw`Cron schedule \(vercel\.json\):[\s\S]*?"0 \*/3 \* \* \*"`,
    );
    expect(route).not.toMatch(staleAsActive);
  });
});
