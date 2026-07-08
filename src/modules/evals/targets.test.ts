import { describe, it, expect } from "vitest";
import {
  DEFAULT_VERTICAL,
  DEFAULT_JURISDICTION,
  datasetFilename,
  resultFilename,
  parseDatasetFilename,
  discoverTargets,
  targetLabel,
} from "./targets";

describe("defaults", () => {
  it("are the roofing/nsw V1 wedge", () => {
    expect(DEFAULT_VERTICAL).toBe("roofing");
    expect(DEFAULT_JURISDICTION).toBe("nsw");
  });
});

describe("datasetFilename / resultFilename", () => {
  it("names the dataset <vertical>-<jurisdiction>.jsonl", () => {
    expect(datasetFilename({ vertical: "roofing", jurisdiction: "nsw" })).toBe("roofing-nsw.jsonl");
    expect(datasetFilename({ vertical: "demolition", jurisdiction: "nsw" })).toBe("demolition-nsw.jsonl");
  });

  it("names the result <vertical>-<jurisdiction>-<date>.json", () => {
    expect(resultFilename({ vertical: "roofing", jurisdiction: "nsw" }, "2026-07-03")).toBe(
      "roofing-nsw-2026-07-03.json",
    );
  });
});

describe("parseDatasetFilename", () => {
  it("round-trips a dataset filename back to its target", () => {
    expect(parseDatasetFilename("roofing-nsw.jsonl")).toEqual({ vertical: "roofing", jurisdiction: "nsw" });
    expect(parseDatasetFilename("demolition-sa.jsonl")).toEqual({ vertical: "demolition", jurisdiction: "sa" });
  });

  it("keeps a hyphenated vertical intact (jurisdiction is the last segment)", () => {
    expect(parseDatasetFilename("solar-hot-water-nsw.jsonl")).toEqual({
      vertical: "solar-hot-water",
      jurisdiction: "nsw",
    });
  });

  it("ignores non-dataset names (the results dir, other files)", () => {
    expect(parseDatasetFilename("eval-results")).toBeNull();
    expect(parseDatasetFilename("README.md")).toBeNull();
    expect(parseDatasetFilename("roofing.jsonl")).toBeNull(); // no jurisdiction segment
  });
});

describe("discoverTargets", () => {
  it("finds every dataset file and sorts by vertical then jurisdiction", () => {
    const names = ["demolition-nsw.jsonl", "roofing-nsw.jsonl", "eval-results", "README.md", "roofing-sa.jsonl"];
    expect(discoverTargets(names)).toEqual([
      { vertical: "demolition", jurisdiction: "nsw" },
      { vertical: "roofing", jurisdiction: "nsw" },
      { vertical: "roofing", jurisdiction: "sa" },
    ]);
  });

  it("returns nothing for a directory with no datasets", () => {
    expect(discoverTargets(["eval-results", "README.md"])).toEqual([]);
  });
});

describe("targetLabel", () => {
  it("renders vertical/jurisdiction", () => {
    expect(targetLabel({ vertical: "roofing", jurisdiction: "nsw" })).toBe("roofing/nsw");
  });
});
