// Registry resolution + flag-gating for vertical packs (#30).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getActivePacks,
  getPack,
  getRegisteredPack,
  isFlagEnabled,
  registeredSlugs,
} from "./registry";
import { packTsQuery } from "./types";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("vertical registry — flag gating", () => {
  it("registers roofing (always on) and demolition (gated)", () => {
    expect(registeredSlugs()).toEqual(
      expect.arrayContaining(["roofing", "demolition"]),
    );
  });

  it("resolves the demolition pack through the registry when the flag is on", () => {
    vi.stubEnv("VERTICAL_DEMOLITION_ENABLED", "true");
    const pack = getPack("demolition");
    expect(pack).toBeDefined();
    expect(pack?.slug).toBe("demolition");
    expect(pack?.label).toBe("Demolition");
    expect(getActivePacks().map((p) => p.slug)).toContain("demolition");
  });

  it("accepts '1' as an enabled value but rejects 'false'/'0'/absent", () => {
    vi.stubEnv("VERTICAL_DEMOLITION_ENABLED", "1");
    expect(isFlagEnabled("VERTICAL_DEMOLITION_ENABLED")).toBe(true);
    vi.stubEnv("VERTICAL_DEMOLITION_ENABLED", "false");
    expect(isFlagEnabled("VERTICAL_DEMOLITION_ENABLED")).toBe(false);
    vi.stubEnv("VERTICAL_DEMOLITION_ENABLED", "0");
    expect(isFlagEnabled("VERTICAL_DEMOLITION_ENABLED")).toBe(false);
    vi.stubEnv("VERTICAL_DEMOLITION_ENABLED", "");
    expect(isFlagEnabled("VERTICAL_DEMOLITION_ENABLED")).toBe(false);
  });
});

describe("vertical registry — flag-off invisibility", () => {
  it("does not surface the demolition pack via the runtime resolver", () => {
    vi.stubEnv("VERTICAL_DEMOLITION_ENABLED", "false");
    expect(getPack("demolition")).toBeUndefined();
    const active = getActivePacks().map((p) => p.slug);
    expect(active).not.toContain("demolition");
    expect(active).toContain("roofing"); // baseline unaffected
  });

  it("leaks no demolition vocabulary into the active rule pass when off", () => {
    vi.stubEnv("VERTICAL_DEMOLITION_ENABLED", "false");
    const activeTsQuery = getActivePacks().map(packTsQuery).join(" | ");
    for (const term of ["demolition", "knock-down", "asbestos", "hazmat"]) {
      expect(activeTsQuery).not.toContain(term);
    }
  });

  it("still exposes the dormant pack to build-time tooling via getRegisteredPack", () => {
    vi.stubEnv("VERTICAL_DEMOLITION_ENABLED", "false");
    // Runtime resolver hides it, but tooling can still reach it.
    expect(getPack("demolition")).toBeUndefined();
    expect(getRegisteredPack("demolition")?.slug).toBe("demolition");
  });
});
