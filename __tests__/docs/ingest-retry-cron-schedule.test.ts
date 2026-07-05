// Guard: the ingest-retry route handler's doc comment must quote the SAME cron
// schedule vercel.json registers, and the compensating retry cron must actually
// be registered (issue #125).
//
// The nightly ingest (`0 13 * * *`) has no in-process retry, so a per-LGA
// transient failure only recovers via this secondary hourly poll. If the
// vercel.json entry is dropped or its schedule drifts from the handler comment,
// the wedge-critical Sunday digest silently loses a failed LGA. This test greps
// both files and asserts they agree, mirroring the storm-brief guard (#90).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROUTE_PATH = path.resolve(process.cwd(), "src/app/api/cron/ingest-retry/route.ts");
const VERCEL_PATH = path.resolve(process.cwd(), "vercel.json");

interface VercelCron {
  path: string;
  schedule: string;
}

function registeredIngestRetrySchedule(): string {
  const cfg = JSON.parse(readFileSync(VERCEL_PATH, "utf8")) as { crons: VercelCron[] };
  const entry = cfg.crons.find((c) => c.path === "/api/cron/ingest-retry");
  if (!entry) throw new Error("no ingest-retry cron in vercel.json");
  return entry.schedule;
}

describe("ingest-retry route doc comment cron schedule", () => {
  const route = readFileSync(ROUTE_PATH, "utf8");
  const registered = registeredIngestRetrySchedule();

  it("registers the hourly ingest-retry cron in vercel.json", () => {
    expect(registered).toBe("15 * * * *");
  });

  it("quotes the registered schedule in the handler comment", () => {
    expect(route).toContain(`"${registered}"`);
  });

  it("runs at least as often as, and starts before, the Sunday digest recovery window", () => {
    // The retry must fire between the Sat-night ingest and the Sun 07:00 UTC
    // digest. An hourly (`* `-minute-anchored) schedule guarantees this; a
    // once-daily schedule aligned to the nightly ingest would not.
    expect(registered.split(/\s+/)[1]).toBe("*"); // every hour
  });
});
