// Integration tests for src/modules/relevance/mark-rule-misses.ts (issue #221).
// FR-004 acceptance criterion 4: DAs failing the roofing keyword rule pass
// are persisted with ruleFilteredOut=true, excludedReason='rule_filter_miss'
// for recall-audit purposes.
//
// Fulfils the acceptance criterion's third clause — "a test asserts a
// keyword-miss DA in a subscribed council is flagged true while a keyword-hit
// DA stays false" — by seeding real DAs with known tsquery match/miss behavior
// and asserting their post-marking flag states via the database.
//
// Requires TEST_DATABASE_URL (or DATABASE_URL). Same pre-requisite as
// __tests__/relevance/filters.test.ts — integration tests that need a real
// Postgres instance.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, seedLgaBundles, testDb } from "../setup-test-db";
import { markRulePassMisses } from "@/modules/relevance/mark-rule-misses";

let daSeq = 0;

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
  opts: {
    rawScopeText?: string;
    ruleFilteredOut?: boolean;
    excludedReason?: string | null;
  } = {},
): Promise<string> {
  daSeq++;
  const da = await testDb.developmentApplication.create({
    data: {
      daId: `MRM-INT-${daSeq}`,
      council,
      address: `${daSeq} Test St`,
      description,
      portalUrl: "https://example.com",
      lodgementDate: new Date(),
      sourceApi: "nsw_planning",
      rawScopeText: opts.rawScopeText ?? null,
      ruleFilteredOut: opts.ruleFilteredOut ?? false,
      excludedReason: opts.excludedReason ?? null,
    },
  });
  return da.id;
}

describe("markRulePassMisses", () => {
  // FR-004 acceptance criterion, third clause: keyword-miss DA is flagged true
  // while a keyword-hit DA stays false.
  it("marks a keyword-miss DA in a subscribed council, leaves a keyword-hit DA untouched", async () => {
    const hitId = await seedDA(
      "blacktown",
      "Re-roof existing dwelling with Colorbond sheeting",
    );
    const missId = await seedDA(
      "blacktown",
      "Office fitout — partition walls and electrical upgrades",
    );

    const result = await markRulePassMisses();

    expect(result.marked).toBe(1);
    expect(result.unmarked).toBe(0);

    const miss = await testDb.developmentApplication.findUnique({
      where: { id: missId },
    });
    expect(miss?.ruleFilteredOut).toBe(true);
    expect(miss?.excludedReason).toBe("rule_filter_miss");

    const hit = await testDb.developmentApplication.findUnique({
      where: { id: hitId },
    });
    expect(hit?.ruleFilteredOut).toBe(false);
    expect(hit?.excludedReason).toBeNull();
  });

  // Step 2: vocabulary drift recovery — unmark DAs that were previous misses
  // but now match the tsquery (because keywords were added to the pack).
  it("unmarks a previously-marked miss that now matches the tsquery (vocabulary drift recovery)", async () => {
    const recoverId = await seedDA("blacktown", "Re-roof existing dwelling with Colorbond", {
      ruleFilteredOut: true,
      excludedReason: "rule_filter_miss",
    });

    const result = await markRulePassMisses();

    expect(result.marked).toBe(0);
    expect(result.unmarked).toBe(1);

    const da = await testDb.developmentApplication.findUnique({
      where: { id: recoverId },
    });
    expect(da?.ruleFilteredOut).toBe(false);
    expect(da?.excludedReason).toBeNull();
  });

  // Scope: only DAs in ALL_COUNCIL_SLUGS (the 15 subscribed councils) should
  // be considered for marking.
  it("does not mark DAs outside the subscribed council list", async () => {
    const outsideId = await seedDA("unsubscribed_council", "Office fitout");

    await markRulePassMisses();

    const da = await testDb.developmentApplication.findUnique({
      where: { id: outsideId },
    });
    expect(da?.ruleFilteredOut).toBe(false);
    expect(da?.excludedReason).toBeNull();
  });

  // Step 1 only touches ruleFilteredOut = false rows, so DAs with a different
  // excludedReason (e.g. refused_withdrawn) are never re-marked.
  it("does not overwrite DAs with a non-miss excludedReason", async () => {
    const refusedId = await seedDA("blacktown", "Office fitout", {
      ruleFilteredOut: true,
      excludedReason: "refused_withdrawn",
    });

    const result = await markRulePassMisses();

    expect(result.marked).toBe(0);

    const da = await testDb.developmentApplication.findUnique({
      where: { id: refusedId },
    });
    expect(da?.ruleFilteredOut).toBe(true);
    expect(da?.excludedReason).toBe("refused_withdrawn");
  });

  // The tsquery operates on (description || ' ' || raw_scope_text), so a
  // non-roofing description with a roofing keyword in rawScopeText should
  // count as a hit — and therefore NOT be marked.
  it("considers rawScopeText in the tsquery match", async () => {
    const scopeHit = await seedDA("blacktown", "Carpentry work", {
      rawScopeText: "Colorbond metal roof replacement",
    });
    const fullMiss = await seedDA("blacktown", "Carpentry work", {
      rawScopeText: "Timber framing and joinery",
    });

    const result = await markRulePassMisses();

    // Only the full miss should be marked
    expect(result.marked).toBe(1);
    expect(result.unmarked).toBe(0);

    const hit = await testDb.developmentApplication.findUnique({
      where: { id: scopeHit },
    });
    expect(hit?.ruleFilteredOut).toBe(false);

    const miss = await testDb.developmentApplication.findUnique({
      where: { id: fullMiss },
    });
    expect(miss?.ruleFilteredOut).toBe(true);
    expect(miss?.excludedReason).toBe("rule_filter_miss");
  });

  // The marker is idempotent: running it twice should produce the same result
  // on both calls (marked=1 on first pass, marked=0 on second since nothing
  // changed).
  it("is idempotent — second consecutive run produces zero changes", async () => {
    await seedDA("blacktown", "Office fitout");

    const first = await markRulePassMisses();
    expect(first.marked).toBe(1);
    expect(first.unmarked).toBe(0);

    const second = await markRulePassMisses();
    expect(second.marked).toBe(0);
    expect(second.unmarked).toBe(0);
  });
});
