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
    });
    expect(rows[0].labelledAt).toBeInstanceOf(Date);
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
});
