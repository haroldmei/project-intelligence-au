// Guard (issue #130): the verification-reminder route's doc comment must quote
// the SAME cron schedule that vercel.json actually registers — the storm-brief
// drift (#90) showed how a stale quoted schedule misleads anyone reasoning
// about cadence. This greps both files so they can never silently diverge.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROUTE_PATH = path.resolve(
  process.cwd(),
  "src/app/api/cron/verification-reminder/route.ts",
);
const VERCEL_PATH = path.resolve(process.cwd(), "vercel.json");

function registeredSchedule(): string {
  const cfg = JSON.parse(readFileSync(VERCEL_PATH, "utf8")) as {
    crons: { path: string; schedule: string }[];
  };
  const entry = cfg.crons.find((c) => c.path === "/api/cron/verification-reminder");
  if (!entry) throw new Error("no verification-reminder cron in vercel.json");
  return entry.schedule;
}

describe("verification-reminder cron schedule", () => {
  const route = readFileSync(ROUTE_PATH, "utf8");
  const registered = registeredSchedule();

  it("registers a daily verification-reminder cron in vercel.json", () => {
    expect(registered).toBe("0 5 * * *");
  });

  it("quotes the registered schedule in the handler comment", () => {
    expect(route).toContain(`"${registered}"`);
  });
});
