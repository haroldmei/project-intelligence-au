// #27 — roofing pack manifest + registry resolution.
import { describe, expect, it } from "vitest";
import { getPack, getRegisteredPack, registeredSlugs } from "../registry";
import { roofingPack } from "./pack";

describe("roofing vertical pack manifest", () => {
  it("has a stable id, display name, and version", () => {
    expect(roofingPack.slug).toBe("roofing");
    expect(roofingPack.label).toBe("Roofing");
    expect(roofingPack.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is vocabulary-only (no development-type category filters)", () => {
    expect(roofingPack.developmentTypeFilters).toEqual([]);
  });

  it("loads its rerank fragment from prompt-fragment.md", () => {
    expect(roofingPack.rerankPromptFragment).toContain(
      "## Relevance rubric (0–5)",
    );
    expect(roofingPack.rerankPromptFragment).toContain("## Hard constraints");
  });
});

describe("registry resolves roofing as the always-on entry", () => {
  it("registers roofing", () => {
    expect(registeredSlugs()).toContain("roofing");
  });

  it("resolves roofing without any flag (baseline, always active)", () => {
    const pack = getPack("roofing");
    expect(pack).toBeDefined();
    expect(pack?.slug).toBe("roofing");
    // Same instance the build-time resolver returns.
    expect(getRegisteredPack("roofing")).toBe(pack);
  });
});
