// Unit tests for the BOM area → LGA keyword matching (#20).
import { describe, it, expect } from "vitest";
import { matchLgas, lgaNames, ALL_LGA_IDS } from "./lgas";

describe("matchLgas", () => {
  it("maps 'Sydney Metropolitan' to all 15 wedge LGAs", () => {
    expect(matchLgas(["Sydney Metropolitan"])).toEqual([...ALL_LGA_IDS]);
    expect(matchLgas(["Sydney Metropolitan"])).toHaveLength(15);
  });

  it("maps a bare district keyword 'metropolitan' to all LGAs (case-insensitive)", () => {
    expect(matchLgas(["parts of the METROPOLITAN district"])).toEqual([...ALL_LGA_IDS]);
  });

  it("maps specific towns to their containing LGA", () => {
    expect(matchLgas(["near Penrith and Blacktown"])).toEqual(["blacktown", "penrith"]);
    expect(matchLgas(["Cronulla and the Sutherland Shire"])).toEqual(["sutherland"]);
  });

  it("returns canonical (NSW_REGIONS) order regardless of input order", () => {
    // sutherland is last, blacktown first in the canonical list.
    expect(matchLgas(["Sutherland", "Blacktown"])).toEqual(["blacktown", "sutherland"]);
  });

  it("returns [] when no wedge LGA is named", () => {
    expect(matchLgas(["Far West", "Riverina", "Snowy Mountains"])).toEqual([]);
    expect(matchLgas([])).toEqual([]);
  });

  it("does not over-match bare 'Sydney' to City of Sydney", () => {
    // "Sydney Metropolitan" must NOT resolve to *only* city_of_sydney — it's
    // the whole basin. And a stray "Sydney" without a district keyword that we
    // map should not silently pin city_of_sydney.
    expect(matchLgas(["Sydney Metropolitan"])).toContain("city_of_sydney");
    expect(matchLgas(["Sydney Metropolitan"])).toHaveLength(15);
  });

  it("dedupes overlapping keyword hits", () => {
    // Both "sutherland" and "sutherland shire" and "cronulla" map to sutherland.
    expect(matchLgas(["Sutherland Shire, Sutherland, Cronulla"])).toEqual(["sutherland"]);
  });
});

describe("lgaNames", () => {
  it("returns display names in canonical order", () => {
    expect(lgaNames(["sutherland", "blacktown"])).toEqual(["Blacktown", "Sutherland"]);
  });
});
