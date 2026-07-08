// Unit tests for src/modules/relevance/mark-rule-misses.ts (issue #221).
// FR-004 acceptance criterion 4: DAs failing the roofing keyword rule pass
// are persisted with ruleFilteredOut=true, excludedReason='rule_filter_miss'
// for recall-audit purposes.
//
// Tests the contract boundary of the marker: $executeRaw is called twice,
// the returned counts propagate correctly, and the function integrates with
// the roofing vertical pack's tsquery. Full SQL correctness is verified by
// end-to-end ingest integration tests (requires TEST_DATABASE_URL).
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies to avoid env validation on import. ALL_COUNCIL_SLUGS is
// just a constant array — the actual module tree (ingest → retry → env) is
// heavy and has no bearing on unit-testing markRulePassMisses.
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    $executeRaw: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/modules/ingestion/ingest", () => ({
  ALL_COUNCIL_SLUGS: [
    "penrith", "blacktown", "parramatta", "cumberland", "the_hills",
    "inner_west", "sydney", "strathfield", "burwood",
    "north_sydney", "willoughby", "hornsby", "lane_cove", "kur_ring_gai",
    "sutherland",
  ],
}));

import { markRulePassMisses, type MarkRulePassMissesResult } from "@/modules/relevance/mark-rule-misses";

describe("markRulePassMisses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls $executeRaw twice (mark misses + unmark vocabulary drift)", async () => {
    mockDb.$executeRaw.mockResolvedValue(5);

    const result = await markRulePassMisses();

    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(2);
    expect(result).toEqual<MarkRulePassMissesResult>({ marked: 5, unmarked: 5 });
  });

  it("returns zero counts when no DAs are affected", async () => {
    mockDb.$executeRaw.mockResolvedValue(0);

    const result = await markRulePassMisses();
    expect(result).toEqual<MarkRulePassMissesResult>({ marked: 0, unmarked: 0 });
  });

  it("propagates independent marked / unmarked counts", async () => {
    mockDb.$executeRaw
      .mockResolvedValueOnce(12) // first call: marked
      .mockResolvedValueOnce(3); // second call: unmarked

    const result = await markRulePassMisses();
    expect(result).toEqual<MarkRulePassMissesResult>({ marked: 12, unmarked: 3 });
  });

  it("builds a valid tsquery from the roofing vertical pack (no throw)", async () => {
    mockDb.$executeRaw.mockResolvedValue(0);
    // Should not throw — the pack must be registered for buildTsQuery.
    await expect(markRulePassMisses()).resolves.not.toThrow();
    // Verify calls contained valid-looking SQL statements.
    const calls = mockDb.$executeRaw.mock.calls;
    // Each call receives a template strings array (first arg) + interpolations;
    // the first template part starts with the SQL keyword we need to verify.
    expect(calls[0][0][0]).toContain("UPDATE development_applications");
    expect(calls[1][0][0]).toContain("UPDATE development_applications");
    // And the second (step 2) is the unmark phase.
    expect(calls[1][0][0]).toContain("SET rule_filtered_out = false");
  });
});
