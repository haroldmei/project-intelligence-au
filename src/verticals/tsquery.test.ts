// tsquery composition + keyword-fallback matcher for vertical packs (#30).
import { describe, expect, it } from "vitest";
import {
  keywordsToTsQuery,
  matchesVocabulary,
  packTsQuery,
} from "./types";
import { demolitionPack } from "./demolition";

describe("keywordsToTsQuery", () => {
  it("joins with ' | ', lowercases, and phrase-links whitespace with <->", () => {
    expect(keywordsToTsQuery(["Demolition", "knock down"])).toBe(
      "demolition | knock<->down",
    );
  });

  it("dedupes case-insensitively so overlapping tiers don't bloat the query", () => {
    expect(keywordsToTsQuery(["demolition", "Demolition", "  demolition  "])).toBe(
      "demolition",
    );
  });

  it("drops empty entries", () => {
    expect(keywordsToTsQuery(["", "  ", "hazmat"])).toBe("hazmat");
  });
});

describe("packTsQuery(demolitionPack)", () => {
  const q = packTsQuery(demolitionPack);

  it("includes explicit demolition evidence terms", () => {
    expect(q).toContain("demolition");
    expect(q).toContain("asbestos<->removal");
    expect(q).toContain("knock-down<->rebuild");
    expect(q).toContain("site<->clearance");
  });

  it("includes implicit terms (recall tier)", () => {
    expect(q).toContain("knock<->down");
    expect(q).toContain("vacant<->possession");
    expect(q).toContain("make-safe");
  });

  it("is a single OR-composition (no stray separators)", () => {
    const clauses = q.split(" | ");
    expect(clauses.length).toBeGreaterThan(10);
    expect(clauses.every((c) => c.length > 0)).toBe(true);
  });

  it("does NOT include 'strip-out' — the canonical fit-out false positive", () => {
    expect(q).not.toContain("strip");
  });
});

describe("matchesVocabulary — keyword fallback (pre-#26)", () => {
  it("matches a clear demolition DA", () => {
    expect(
      matchesVocabulary(
        demolitionPack,
        "Demolition of existing dwelling; site to be left clear.",
      ),
    ).toBe(true);
  });

  it("does not match a pure roofing DA", () => {
    expect(
      matchesVocabulary(
        demolitionPack,
        "Full re-roof with Colorbond metal sheeting and new gutters.",
      ),
    ).toBe(false);
  });

  it("does not match an internal fit-out soft strip-out", () => {
    expect(
      matchesVocabulary(
        demolitionPack,
        "Internal fit-out — soft strip-out of partitions, new ceiling tiles.",
      ),
    ).toBe(false);
  });
});
