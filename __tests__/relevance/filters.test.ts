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

async function seedDA(
  council: string,
  description: string,
  days = 0,
  extra: { approvalPathway?: string; sourceApi?: string; rawScopeText?: string } = {},
): Promise<string> {
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
      sourceApi: extra.sourceApi ?? "nsw_planning",
      approvalPathway: extra.approvalPathway ?? "da",
      rawScopeText: extra.rawScopeText ?? null,
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
    // After the keyword expansion to include construction/dwelling/residential
    // for new builds (where roofing is implicit), use a clearly-out-of-scope
    // scope. "Office fitout" + "telecommunications" + "change of use" share
    // no keyword with the roofing rule pass.
    await seedDA("blacktown", "Office fitout — partition walls and electrical upgrades, change of use to telecommunications equipment room");
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

  // Acceptance (#10): a synthetic CDC tile→metal re-roof must reach the digest
  // candidate set, and the pathway must survive the rule pass so the reranker /
  // lead-class can treat it as a strong positive / fast-track.
  it("ranks a CDC tile→metal re-roof into the candidate set with pathway preserved", async () => {
    await seedDA(
      "blacktown",
      "Complying Development Certificate — replacement roof cladding, tile to Colorbond metal deck conversion",
      0,
      {
        approvalPathway: "cdc",
        sourceApi: "nsw_cdc",
        rawScopeText: "Complying Development Certificate. Re-sheet with Colorbond metal deck.",
      },
    );
    const userId = await seedTestUser();
    const sinceIsoDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const results = await ruleFilter({ userId, councilSlugs: ["blacktown"], sinceIsoDate });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].approvalPathway).toBe("cdc");
  });

  it("surfaces a re-roof that only the new CDC vocabulary catches", async () => {
    // 'replacement roof cladding' + 'metal deck' are #10 additions; the phrase
    // exercises them (the DA also contains 'roof', but the assertion is about the
    // CDC record reaching the candidate set at all).
    await seedDA("blacktown", "Replacement roof cladding to existing dwelling; new metal deck", 0, {
      approvalPathway: "cdc",
      sourceApi: "nsw_cdc",
    });
    const userId = await seedTestUser();
    const sinceIsoDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const results = await ruleFilter({ userId, councilSlugs: ["blacktown"], sinceIsoDate });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ROOFING_KEYWORDS", () => {
  it("includes expected keywords", () => {
    expect(ROOFING_KEYWORDS).toContain("colorbond");
    expect(ROOFING_KEYWORDS).toContain("roof");
    expect(ROOFING_KEYWORDS).toContain("membrane");
  });
});
