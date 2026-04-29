// Integration tests for src/modules/relevance/filters.ts (ruleFilter)
// FR-004 | system-design §3.4 — GIN tsvector rule pass
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import { ruleFilter, ROOFING_KEYWORDS } from "@/modules/relevance/filters";

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
});

afterAll(async () => {
  await testDb.$disconnect();
});

async function seedDA(council: string, description: string, days = 0): Promise<string> {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const da = await testDb.developmentApplication.create({
    data: {
      daId: `TEST-${Date.now()}-${Math.random()}`,
      council,
      address: "1 Test St",
      description,
      portalUrl: "https://example.com",
      lodgementDate: date,
      sourceApi: "nsw_planning",
    },
  });
  return da.id;
}

describe("ruleFilter", () => {
  it("returns DAs matching roofing keywords", async () => {
    await seedDA("blacktown", "Re-roof existing dwelling with Colorbond sheeting");
    const userId = await seedTestUser();
    const sinceIsoDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const results = await ruleFilter({ userId, councilSlugs: ["blacktown"], sinceIsoDate });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes non-roofing DAs", async () => {
    await seedDA("blacktown", "Construct new residential swimming pool");
    const userId = await seedTestUser();
    const sinceIsoDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const results = await ruleFilter({ userId, councilSlugs: ["blacktown"], sinceIsoDate });
    expect(results.length).toBe(0);
  });

  it("filters by council", async () => {
    await seedDA("blacktown", "Colorbond roof replacement");
    const userId = await seedTestUser();
    const sinceIsoDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Request inner_west only — blacktown DA should not appear
    const results = await ruleFilter({ userId, councilSlugs: ["inner_west"], sinceIsoDate });
    expect(results.length).toBe(0);
  });

  it("filters by date (excludes old DAs)", async () => {
    await seedDA("blacktown", "Colorbond metal roof replacement", 10); // 10 days ago
    const userId = await seedTestUser();
    const sinceIsoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const results = await ruleFilter({ userId, councilSlugs: ["blacktown"], sinceIsoDate });
    expect(results.length).toBe(0);
  });

  it("returns empty array for empty councilSlugs", async () => {
    const results = await ruleFilter({ userId: "u1", councilSlugs: [], sinceIsoDate: "2026-01-01" });
    expect(results).toEqual([]);
  });
});

describe("ROOFING_KEYWORDS", () => {
  it("includes expected keywords", () => {
    expect(ROOFING_KEYWORDS).toContain("colorbond");
    expect(ROOFING_KEYWORDS).toContain("roof");
    expect(ROOFING_KEYWORDS).toContain("membrane");
  });
});
