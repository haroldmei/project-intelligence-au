import { describe, it, expect } from "vitest";
import { getDigestArrival, getDigestArrivalString } from "./digest-arrival";

const REASSURANCE =
  "we're already scanning 15 Sydney LGAs for re-roof DAs";

// ── Date reference ─────────────────────────────────────────────────────────
// All test dates are in July 2026, which is Australian winter (AEST, UTC+10,
// no DST transitions). The digest fires Sunday at 18:00 AEST (= 08:00 UTC).
//
// Calendar:
//   2026-07-05 = Sunday
//   2026-07-06 = Monday
//   2026-07-07 = Tuesday
//   2026-07-08 = Wednesday
//   2026-07-09 = Thursday
//   2026-07-10 = Friday
//   2026-07-11 = Saturday
//   2026-07-12 = Sunday
//   2026-07-13 = Monday

describe("getDigestArrival", () => {
  describe('"this Sunday" branch (≥ 60 hours to next digest)', () => {
    it("returns 'this' when far from Sunday (Tuesday noon AEST, ~126h)", () => {
      // Tuesday 2026-07-07 12:00 AEST = 2026-07-07 02:00 UTC
      const tuesday = new Date("2026-07-07T02:00:00Z");
      const result = getDigestArrival(tuesday);
      expect(result.prefix).toBe("this");
      expect(result.full).toContain("this Sunday");
      expect(result.full).toContain(REASSURANCE);
    });

    it("returns 'this' at exactly 60h before (Friday 06:00 AEST)", () => {
      // Sunday 18:00 AEST - 60h = Friday 06:00 AEST = Thursday 20:00 UTC
      // Strictly < 60h → "this" (not "next").
      const friday0600 = new Date("2026-07-09T20:00:00Z"); // Thu 20:00 UTC = Fri 06:00 AEST
      const result = getDigestArrival(friday0600);
      expect(result.prefix).toBe("this");
      expect(result.full).toContain("this Sunday");
    });

    it("returns 'this' shortly before 60h cutoff (Thursday midnight AEST, ~66h)", () => {
      // Thursday 2026-07-09 00:00 AEST = 2026-07-08 14:00 UTC
      const thuMidnight = new Date("2026-07-08T14:00:00Z");
      const result = getDigestArrival(thuMidnight);
      expect(result.prefix).toBe("this");
      expect(result.full).toContain("this Sunday");
    });
  });

  describe('"next Sunday" branch (< 60 hours to next digest)', () => {
    it("returns 'next' on Saturday morning (Saturday 10:00 AEST, ~32h)", () => {
      // Saturday 2026-07-11 10:00 AEST = 2026-07-11 00:00 UTC
      const saturday = new Date("2026-07-11T00:00:00Z");
      const result = getDigestArrival(saturday);
      expect(result.prefix).toBe("next");
      expect(result.full).toContain("next Sunday");
      expect(result.full).toContain(REASSURANCE);
    });

    it("returns 'next' on Friday evening (Friday 20:00 AEST, ~46h)", () => {
      // Friday 2026-07-10 20:00 AEST = 2026-07-10 10:00 UTC
      const friday = new Date("2026-07-10T10:00:00Z");
      const result = getDigestArrival(friday);
      expect(result.prefix).toBe("next");
      expect(result.full).toContain("next Sunday");
    });

  });

  describe("same-Sunday edge case", () => {
    it("returns 'next' on Sunday before 18:00 (8h to digest, <60h)", () => {
      // Sunday 2026-07-12 10:00 AEST = 2026-07-12 00:00 UTC
      // Digest fires at 18:00 AEST → 8h away → <60h → "next Sunday"
      const sundayMorning = new Date("2026-07-12T00:00:00Z");
      const result = getDigestArrival(sundayMorning);
      expect(result.prefix).toBe("next");
      expect(result.full).toContain("next Sunday");
    });

    it("returns 'this' on Sunday after 18:00 (166h to next digest, >=60h)", () => {
      // Sunday 2026-07-12 20:00 AEST = 2026-07-12 10:00 UTC
      // Next digest is next Sunday → 166h away → >=60h → "this Sunday"
      const sundayEvening = new Date("2026-07-12T10:00:00Z");
      const result = getDigestArrival(sundayEvening);
      expect(result.prefix).toBe("this");
      expect(result.full).toContain("this Sunday");
    });
  });

  describe("formatting", () => {
    it("includes the date in dateStr", () => {
      const tuesday = new Date("2026-07-07T02:00:00Z");
      const result = getDigestArrival(tuesday);
      // Next Sunday after Tuesday July 7 is Sunday July 12
      expect(result.dateStr).toMatch(/Sunday/);
      expect(result.dateStr).toMatch(/12/);
    });

    it("full string wraps dateStr and reassurance", () => {
      const tuesday = new Date("2026-07-07T02:00:00Z");
      const result = getDigestArrival(tuesday);
      expect(result.full).toContain(result.dateStr);
      expect(result.full).toContain(REASSURANCE);
      expect(result.full).toContain("6 pm");
    });
  });
});

describe("getDigestArrivalString (convenience wrapper)", () => {
  it("returns a string", () => {
    const tuesday = new Date("2026-07-07T02:00:00Z");
    const str = getDigestArrivalString(tuesday);
    expect(typeof str).toBe("string");
    expect(str).toContain(REASSURANCE);
  });
});
