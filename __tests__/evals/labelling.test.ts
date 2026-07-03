// Integration tests for src/modules/evals/labelling.ts (issue #19).
// Vitest + real Postgres test DB — verifies the labelling CLI's DB layer writes
// valid DaGroundTruth rows, stays idempotent, imports thumbs as candidates, and
// exposes the joined rows the export script needs.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import {
  selectUnlabelledStratified,
  recordLabel,
  importThumbsAsCandidates,
  loadGroundTruthForExport,
} from "@/modules/evals/labelling";

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles(); // blacktown / parramatta / inner_west reference rows (lga_id FK)
});

afterAll(async () => {
  await testDb.$disconnect();
});

let daSeq = 0;
async function seedDA(opts: {
  council?: string;
  description?: string;
  ruleFilteredOut?: boolean;
  estimatedValue?: number | null;
  lgaId?: string | null;
  jurisdiction?: string;
}): Promise<string> {
  daSeq++;
  const da = await testDb.developmentApplication.create({
    data: {
      daId: `GT-${daSeq}`,
      council: opts.council ?? "penrith",
      address: `${daSeq} Roof St`,
      description: opts.description ?? "Re-roof existing dwelling with Colorbond",
      portalUrl: "https://example.com",
      lodgementDate: new Date(),
      sourceApi: "nsw_planning",
      ruleFilteredOut: opts.ruleFilteredOut ?? false,
      estimatedValue: opts.estimatedValue ?? 120000,
      lgaId: opts.lgaId ?? null,
      ...(opts.jurisdiction ? { jurisdiction: opts.jurisdiction } : {}),
    },
  });
  return da.id;
}

describe("selectUnlabelledStratified", () => {
  it("returns rule-hits and rule-misses that the labeller hasn't labelled", async () => {
    const hit = await seedDA({ ruleFilteredOut: false });
    const miss = await seedDA({ ruleFilteredOut: true });

    const { hits, misses } = await selectUnlabelledStratified(testDb, {
      labelledBy: "founder",
      limitPerStratum: 10,
    });
    expect(hits.map((d) => d.id)).toContain(hit);
    expect(misses.map((d) => d.id)).toContain(miss);
    expect(hits.every((d) => d.ruleFilteredOut === false)).toBe(true);
    expect(misses.every((d) => d.ruleFilteredOut === true)).toBe(true);
  });

  it("excludes DAs already labelled by that labeller, but not by another", async () => {
    const da = await seedDA({ ruleFilteredOut: false });
    await recordLabel(testDb, { daId: da, council: "penrith", isRelevant: true, labelledBy: "alice" });

    const forAlice = await selectUnlabelledStratified(testDb, { labelledBy: "alice", limitPerStratum: 10 });
    expect(forAlice.hits.map((d) => d.id)).not.toContain(da);

    const forBob = await selectUnlabelledStratified(testDb, { labelledBy: "bob", limitPerStratum: 10 });
    expect(forBob.hits.map((d) => d.id)).toContain(da);
  });

  it("surfaces a DA again for a second vertical even when the labeller labelled it for another (#31)", async () => {
    const da = await seedDA({ ruleFilteredOut: false });
    // Labelled for roofing (the default vertical) by alice.
    await recordLabel(testDb, { daId: da, council: "penrith", isRelevant: true, labelledBy: "alice" });

    // Roofing pass no longer offers it…
    const roofing = await selectUnlabelledStratified(testDb, { labelledBy: "alice", limitPerStratum: 10 });
    expect(roofing.hits.map((d) => d.id)).not.toContain(da);

    // …but the demolition pass still does — the roofing label doesn't cover it.
    const demolition = await selectUnlabelledStratified(testDb, {
      labelledBy: "alice",
      limitPerStratum: 10,
      vertical: "demolition",
    });
    expect(demolition.hits.map((d) => d.id)).toContain(da);
  });

  it("scopes the queue to the requested jurisdiction (#31)", async () => {
    const nswDa = await seedDA({ ruleFilteredOut: false, jurisdiction: "nsw" });
    const saDa = await seedDA({ ruleFilteredOut: false, jurisdiction: "sa" });

    const nsw = await selectUnlabelledStratified(testDb, { labelledBy: "x", limitPerStratum: 10 });
    expect(nsw.hits.map((d) => d.id)).toContain(nswDa);
    expect(nsw.hits.map((d) => d.id)).not.toContain(saDa);

    const sa = await selectUnlabelledStratified(testDb, {
      labelledBy: "x",
      limitPerStratum: 10,
      jurisdiction: "sa",
    });
    expect(sa.hits.map((d) => d.id)).toContain(saDa);
    expect(sa.hits.map((d) => d.id)).not.toContain(nswDa);
  });

  it("respects the per-stratum limit", async () => {
    for (let i = 0; i < 3; i++) await seedDA({ ruleFilteredOut: false });
    const { hits } = await selectUnlabelledStratified(testDb, { labelledBy: "x", limitPerStratum: 2 });
    expect(hits).toHaveLength(2);
  });
});

describe("recordLabel", () => {
  it("writes a valid DaGroundTruth row with labeller, source and timestamp", async () => {
    const da = await seedDA({ council: "blacktown" });
    await recordLabel(testDb, { daId: da, council: "blacktown", isRelevant: true, labelledBy: "founder" });

    const rows = await testDb.daGroundTruth.findMany({ where: { daId: da } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      daId: da,
      council: "blacktown",
      isRelevant: true,
      labelledBy: "founder",
      source: "manual",
      // Defaults to the roofing/nsw wedge when the caller doesn't say otherwise.
      vertical: "roofing",
      jurisdiction: "nsw",
    });
    expect(rows[0].labelledAt).toBeInstanceOf(Date);
  });

  it("stamps an explicit (vertical, jurisdiction) on the row (#31)", async () => {
    const da = await seedDA({ jurisdiction: "sa" });
    await recordLabel(testDb, {
      daId: da,
      council: "penrith",
      isRelevant: true,
      labelledBy: "founder",
      vertical: "demolition",
      jurisdiction: "sa",
    });
    const row = await testDb.daGroundTruth.findFirst({ where: { daId: da } });
    expect(row).toMatchObject({ vertical: "demolition", jurisdiction: "sa" });
  });

  it("is idempotent per (daId, labeller) — re-label overwrites, no duplicate", async () => {
    const da = await seedDA({});
    await recordLabel(testDb, { daId: da, council: "penrith", isRelevant: true, labelledBy: "founder" });
    await recordLabel(testDb, { daId: da, council: "penrith", isRelevant: false, labelledBy: "founder" });

    const rows = await testDb.daGroundTruth.findMany({ where: { daId: da } });
    expect(rows).toHaveLength(1);
    expect(rows[0].isRelevant).toBe(false);
  });
});

describe("importThumbsAsCandidates", () => {
  async function seedThumb(daId: string, userId: string, feedback: "up" | "down") {
    await testDb.daFeedback.create({ data: { daId, userId, feedback, source: "portal" } });
  }

  it("imports thumbs as source=thumb candidate labels (up→relevant, down→irrelevant)", async () => {
    const up = await seedDA({ council: "penrith" });
    const down = await seedDA({ council: "the_hills" });
    const user = await seedTestUser();
    await seedThumb(up, user, "up");
    await seedThumb(down, user, "down");

    const res = await importThumbsAsCandidates(testDb);
    expect(res.imported).toBe(2);
    expect(res.skipped).toBe(0);

    const upRow = await testDb.daGroundTruth.findFirst({ where: { daId: up } });
    expect(upRow).toMatchObject({ source: "thumb", isRelevant: true, labelledBy: `thumb:${user}` });
    const downRow = await testDb.daGroundTruth.findFirst({ where: { daId: down } });
    expect(downRow?.isRelevant).toBe(false);
  });

  it("never clobbers a reviewed manual label with a raw thumb", async () => {
    const da = await seedDA({});
    const user = await seedTestUser();
    // A manual label already exists under this user's thumb key.
    await recordLabel(testDb, {
      daId: da,
      council: "penrith",
      isRelevant: true,
      labelledBy: `thumb:${user}`,
      source: "manual",
    });
    await seedThumb(da, user, "down");

    const res = await importThumbsAsCandidates(testDb);
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(1);

    const row = await testDb.daGroundTruth.findFirst({ where: { daId: da, labelledBy: `thumb:${user}` } });
    expect(row).toMatchObject({ source: "manual", isRelevant: true });
  });
});

describe("loadGroundTruthForExport", () => {
  it("joins labels to their DA and returns manual rows by default", async () => {
    const da = await seedDA({ council: "blacktown", description: "Re-roof job", estimatedValue: 90000, lgaId: "blacktown" });
    await recordLabel(testDb, { daId: da, council: "blacktown", isRelevant: true, labelledBy: "founder" });

    const rows = await loadGroundTruthForExport(testDb);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      daId: da,
      council: "blacktown",
      lgaSlug: "blacktown",
      isRelevant: true,
      source: "manual",
      description: "Re-roof job",
      estimatedValue: 90000,
    });
  });

  it("excludes thumb candidates unless includeThumbs is set", async () => {
    const da = await seedDA({});
    const user = await seedTestUser();
    await testDb.daFeedback.create({ data: { daId: da, userId: user, feedback: "up", source: "portal" } });
    await importThumbsAsCandidates(testDb);

    expect(await loadGroundTruthForExport(testDb)).toHaveLength(0);
    expect(await loadGroundTruthForExport(testDb, { includeThumbs: true })).toHaveLength(1);
  });

  it("scopes the export to one (vertical, jurisdiction) — each gold set is its own file (#31)", async () => {
    const roofingDa = await seedDA({ description: "Re-roof job", lgaId: "blacktown" });
    const demolitionDa = await seedDA({ description: "Demolition job", lgaId: "blacktown" });
    await recordLabel(testDb, { daId: roofingDa, council: "blacktown", isRelevant: true, labelledBy: "founder" });
    await recordLabel(testDb, {
      daId: demolitionDa,
      council: "blacktown",
      isRelevant: true,
      labelledBy: "founder",
      vertical: "demolition",
    });

    // Default query is roofing/nsw — only the roofing label comes back.
    const roofing = await loadGroundTruthForExport(testDb);
    expect(roofing.map((r) => r.daId)).toEqual([roofingDa]);

    const demolition = await loadGroundTruthForExport(testDb, { vertical: "demolition" });
    expect(demolition.map((r) => r.daId)).toEqual([demolitionDa]);
  });
});
