// Unit tests for the jurisdiction config + timezone groundwork (#28). Pure, no
// DB / no network — runs in the always-on fe suite. The load-bearing cases are
// the DST-boundary week-window fixtures: a fixed-offset implementation gets
// these wrong by an hour, which is exactly the bug this replaces.
import { describe, it, expect, beforeEach } from "vitest";
import {
  JURISDICTION_CONFIGS,
  NSW_REGIONS,
  getJurisdictionConfig,
  getEnabledJurisdictionIds,
  isFlagEnabled,
  weekStartInZone,
  digestWeekWindow,
} from "./config";

const HOUR = 3_600_000;

beforeEach(() => {
  delete process.env.SA_INGEST_ENABLED;
});

describe("jurisdiction config", () => {
  it("exposes NSW with Australia/Sydney + AUD and a Sunday 18:00 digest anchor", () => {
    const nsw = getJurisdictionConfig("nsw");
    expect(nsw).toMatchObject({
      id: "nsw",
      timezone: "Australia/Sydney",
      currency: "AUD",
      digestDayOfWeek: 0,
      digestHourLocal: 18,
    });
  });

  it("exposes SA with its own Adelaide timezone", () => {
    expect(getJurisdictionConfig("sa").timezone).toBe("Australia/Adelaide");
  });

  it("throws on an unknown jurisdiction", () => {
    expect(() => getJurisdictionConfig("qld")).toThrow(/Unknown jurisdiction/);
  });

  it("keys NSW_REGIONS to the 15 wedge councils, matching the config registry", () => {
    expect(NSW_REGIONS).toHaveLength(15);
    expect(NSW_REGIONS).toContain("blacktown");
    expect(Object.keys(JURISDICTION_CONFIGS)).toEqual(["nsw", "sa"]);
  });
});

describe("getEnabledJurisdictionIds", () => {
  it("returns NSW only by default (SA dormant)", () => {
    expect(getEnabledJurisdictionIds()).toEqual(["nsw"]);
  });

  it("adds SA when its flag is truthy, NSW still first", () => {
    process.env.SA_INGEST_ENABLED = "1";
    expect(getEnabledJurisdictionIds()).toEqual(["nsw", "sa"]);
  });

  it("uses strict truthiness for flags", () => {
    process.env.SA_INGEST_ENABLED = "false";
    expect(isFlagEnabled("SA_INGEST_ENABLED")).toBe(false);
    expect(getEnabledJurisdictionIds()).toEqual(["nsw"]);
  });
});

describe("weekStartInZone — Sydney Monday 00:00 anchor", () => {
  it("anchors to Monday 00:00 AEST in winter (UTC+10)", () => {
    // Wed 2026-06-17 05:00 UTC = Wed 15:00 AEST. Week's Monday is 2026-06-15
    // 00:00 AEST = 2026-06-14 14:00 UTC.
    const start = weekStartInZone("Australia/Sydney", new Date("2026-06-17T05:00:00Z"));
    expect(start.toISOString()).toBe("2026-06-14T14:00:00.000Z");
  });

  it("anchors to Monday 00:00 AEDT in summer (UTC+11)", () => {
    // Wed 2026-01-14 05:00 UTC = Wed 16:00 AEDT. Week's Monday is 2026-01-12
    // 00:00 AEDT = 2026-01-11 13:00 UTC. A fixed UTC+10 impl would return 14:00.
    const start = weekStartInZone("Australia/Sydney", new Date("2026-01-14T05:00:00Z"));
    expect(start.toISOString()).toBe("2026-01-11T13:00:00.000Z");
  });
});

describe("digestWeekWindow — Sunday 18:00 local, DST-correct", () => {
  const nsw = getJurisdictionConfig("nsw");

  it("spans a plain 168h week away from DST boundaries (winter)", () => {
    // Now: Mon 2026-06-15 09:00 UTC (well after the prior Sunday 18:00 AEST).
    // end   = Sun 2026-06-14 18:00 AEST = 2026-06-14 08:00 UTC
    // start = Sun 2026-06-07 18:00 AEST = 2026-06-07 08:00 UTC
    const { start, end } = digestWeekWindow(nsw, new Date("2026-06-15T09:00:00Z"));
    expect(end.toISOString()).toBe("2026-06-14T08:00:00.000Z");
    expect(start.toISOString()).toBe("2026-06-07T08:00:00.000Z");
    expect((end.getTime() - start.getTime()) / HOUR).toBe(168);
  });

  it("spans 169h across the autumn DST end (AEDT→AEST, clocks back)", () => {
    // Sydney DST ends Sun 2026-04-05 03:00 (AEDT→AEST). Evaluate just after that
    // Sunday's 18:00 anchor.
    //   end   = Sun 2026-04-05 18:00 AEST  = 2026-04-05 08:00 UTC
    //   start = Sun 2026-03-29 18:00 AEDT  = 2026-03-29 07:00 UTC
    // The extra hour of AEDT makes the window 169h — a fixed offset gets 168.
    const { start, end } = digestWeekWindow(nsw, new Date("2026-04-05T09:00:00Z"));
    expect(end.toISOString()).toBe("2026-04-05T08:00:00.000Z");
    expect(start.toISOString()).toBe("2026-03-29T07:00:00.000Z");
    expect((end.getTime() - start.getTime()) / HOUR).toBe(169);
  });

  it("spans 167h across the spring DST start (AEST→AEDT, clocks forward)", () => {
    // Sydney DST starts Sun 2026-10-04 02:00 (AEST→AEDT). Evaluate just after
    // that Sunday's 18:00 anchor.
    //   end   = Sun 2026-10-04 18:00 AEDT  = 2026-10-04 07:00 UTC
    //   start = Sun 2026-09-27 18:00 AEST  = 2026-09-27 08:00 UTC
    // The lost hour makes the window 167h.
    const { start, end } = digestWeekWindow(nsw, new Date("2026-10-04T09:00:00Z"));
    expect(end.toISOString()).toBe("2026-10-04T07:00:00.000Z");
    expect(start.toISOString()).toBe("2026-09-27T08:00:00.000Z");
    expect((end.getTime() - start.getTime()) / HOUR).toBe(167);
  });

  it("steps back a week when the current cycle's anchor hasn't passed yet", () => {
    // Now: Sun 2026-06-14 04:00 UTC = Sun 14:00 AEST, before that day's 18:00
    // anchor. The window must close on the PREVIOUS Sunday 18:00.
    const { end } = digestWeekWindow(nsw, new Date("2026-06-14T04:00:00Z"));
    expect(end.toISOString()).toBe("2026-06-07T08:00:00.000Z");
  });
});
