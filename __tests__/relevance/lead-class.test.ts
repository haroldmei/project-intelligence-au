// Unit tests for the honest lead-class classifier (issue #14).
// Pure function — no DB, no env. Covers each class, the CDC-pathway path, the
// heritage-beats-CDC precedence, the ambiguous fallback, and the grouping /
// coercion helpers. Aims for full branch coverage per the acceptance criteria.
import { describe, it, expect } from "vitest";
import {
  classifyLeadClass,
  groupByLeadClass,
  isLeadClass,
  toLeadClass,
  LEAD_CLASSES,
  LEAD_CLASS_GROUP_ORDER,
  LEAD_CLASS_META,
  type LeadClass,
} from "@/modules/relevance/lead-class";

describe("classifyLeadClass", () => {
  describe("strata & heritage", () => {
    const strataHeritageCases: Array<[string, Parameters<typeof classifyLeadClass>[0]]> = [
      ["heritage re-roof", { description: "Heritage-listed dwelling — slate roof restoration" }],
      ["conservation area", { description: "Re-roofing within a conservation area" }],
      ["strata block", { description: "Strata common-property roof replacement" }],
      ["class 2 (spaced)", { description: "Class 2 residential flat building — roof upgrade" }],
      ["class-2 (hyphen normalises)", { rawScopeText: "Re-roof of a class-2 apartment building" }],
      ["class two (worded)", { description: "Re-roofing a class two building" }],
      ["residential flat building", { developmentType: "Residential flat building" }],
      ["remediation", { description: "High-value facade and roof remediation works" }],
      ["cladding", { description: "Combustible cladding rectification and roof works" }],
    ];
    it.each(strataHeritageCases)("classifies %s as strata_heritage", (_label, input) => {
      expect(classifyLeadClass(input)).toBe("strata_heritage");
    });

    it("beats a CDC pathway (heritage is excluded from complying development)", () => {
      expect(
        classifyLeadClass({
          approvalPathway: "Complying Development Certificate",
          description: "Heritage item — tile to metal re-roof",
        }),
      ).toBe("strata_heritage");
    });
  });

  describe("fast-track (CDC)", () => {
    it("classifies a CDC pathway as fast_track", () => {
      expect(
        classifyLeadClass({
          approvalPathway: "Complying Development",
          description: "Tile to metal re-roof of a single dwelling",
        }),
      ).toBe("fast_track");
    });

    it("classifies a 'CDC' pathway token as fast_track", () => {
      expect(classifyLeadClass({ approvalPathway: "CDC" })).toBe("fast_track");
    });

    it("classifies an explicit complying-development mention (no pathway) as fast_track", () => {
      expect(
        classifyLeadClass({ description: "Complying development certificate for a new roof" }),
      ).toBe("fast_track");
    });

    it("classifies a pattern-book approval as fast_track", () => {
      expect(classifyLeadClass({ rawScopeText: "Pattern book dwelling approval" })).toBe(
        "fast_track",
      );
    });

    it("does NOT treat SA 'Code Assessed' pathway as CDC", () => {
      // SA's assessmentpathway is not complying development — must fall through.
      expect(
        classifyLeadClass({
          approvalPathway: "Code Assessed - Deemed to Satisfy",
          description: "New two-storey dwelling",
        }),
      ).toBe("builder_pipeline");
    });
  });

  describe("builder pipeline", () => {
    it("classifies alterations & additions as builder_pipeline", () => {
      expect(
        classifyLeadClass({ description: "Alterations and additions to a dwelling" }),
      ).toBe("builder_pipeline");
    });

    it("classifies a new dwelling as builder_pipeline", () => {
      expect(classifyLeadClass({ developmentType: "New dwelling" })).toBe("builder_pipeline");
    });
  });

  describe("ambiguous fallback", () => {
    it("defaults an unrecognised scope to builder_pipeline", () => {
      expect(classifyLeadClass({ description: "Erection of a carport and front fence" })).toBe(
        "builder_pipeline",
      );
    });

    it("defaults empty / null input to builder_pipeline", () => {
      expect(classifyLeadClass({})).toBe("builder_pipeline");
      expect(
        classifyLeadClass({ approvalPathway: null, description: null, rawScopeText: null, developmentType: null }),
      ).toBe("builder_pipeline");
    });
  });

  it("is deterministic and case-insensitive", () => {
    const input = { description: "HERITAGE CONSERVATION ROOF WORKS" };
    expect(classifyLeadClass(input)).toBe("strata_heritage");
    expect(classifyLeadClass(input)).toBe(classifyLeadClass(input));
  });
});

describe("isLeadClass / toLeadClass", () => {
  it("isLeadClass recognises valid classes only", () => {
    expect(isLeadClass("fast_track")).toBe(true);
    expect(isLeadClass("strata_heritage")).toBe(true);
    expect(isLeadClass("builder_pipeline")).toBe(true);
    expect(isLeadClass("nope")).toBe(false);
  });

  it("toLeadClass passes valid values through and defaults the rest", () => {
    expect(toLeadClass("fast_track")).toBe("fast_track");
    expect(toLeadClass("garbage")).toBe("builder_pipeline");
    expect(toLeadClass(null)).toBe("builder_pipeline");
    expect(toLeadClass(undefined)).toBe("builder_pipeline");
  });
});

describe("groupByLeadClass", () => {
  const mk = (id: string, leadClass: LeadClass) => ({ id, leadClass });

  it("orders groups fast_track → strata_heritage → builder_pipeline", () => {
    const grouped = groupByLeadClass([
      mk("a", "builder_pipeline"),
      mk("b", "fast_track"),
      mk("c", "strata_heritage"),
    ]);
    expect(grouped.map((x) => x.leadClass)).toEqual([
      "fast_track",
      "strata_heritage",
      "builder_pipeline",
    ]);
  });

  it("preserves input (rank) order within a group", () => {
    const grouped = groupByLeadClass([
      mk("r1", "fast_track"),
      mk("r2", "builder_pipeline"),
      mk("r3", "fast_track"),
      mk("r4", "builder_pipeline"),
    ]);
    expect(grouped.map((x) => x.id)).toEqual(["r1", "r3", "r2", "r4"]);
  });

  it("returns an empty array unchanged", () => {
    expect(groupByLeadClass([])).toEqual([]);
  });
});

describe("metadata", () => {
  it("has meta for every class and matching group order", () => {
    expect(new Set(LEAD_CLASS_GROUP_ORDER)).toEqual(new Set(LEAD_CLASSES));
    for (const lc of LEAD_CLASSES) {
      expect(LEAD_CLASS_META[lc].label.length).toBeGreaterThan(0);
      expect(LEAD_CLASS_META[lc].blurb.length).toBeGreaterThan(0);
    }
    expect(LEAD_CLASS_GROUP_ORDER).toEqual(["fast_track", "strata_heritage", "builder_pipeline"]);
  });
});
