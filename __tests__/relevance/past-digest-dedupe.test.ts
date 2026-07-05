// Past-digest dedupe must EXCLUDE the current run (issue #124).
//
// On the Sunday retry tick, runRelevanceForUser re-runs for a user whose
// primary attempt partially failed. By then the primary has already persisted
// THIS run's DigestDa rows. Without a runId filter, loadPastDigestDaIds would
// exclude those very leads, surface an empty candidate set, and send a "quiet
// week" email that disagrees with the persisted portal digest.
//
// These tests stand up a DigestDa table that honours the `where.digest.runId`
// filter (as Postgres would) and assert the excludeDaIds handed to the rule
// filter never contains the current run's own leads, while still excluding
// leads from PRIOR runs.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/cost-ledger", () => ({
  // Force the embedding-only path so excludeDaIds flows straight into the
  // mocked ruleFilter (no real LLM pipeline) — the cost value is > 0.13.
  weeklyCostAud: vi.fn().mockResolvedValue(0.2),
  weekStartAEST: vi.fn().mockReturnValue(new Date("2026-04-28T00:00:00Z")),
}));

// A DigestDa "table": rows tagged with the run that persisted them. findMany
// simulates the Prisma query, honouring the `digest.runId: { not }` filter and
// the distinct(daId) projection. Hoisted so the vi.mock factory below (which is
// itself hoisted above module init) can close over it.
const { digestDaRows, findManyMock } = vi.hoisted(() => {
  const rows: { daId: string; runId: string }[] = [];
  const findMany = vi.fn(
    ({ where }: { where?: { digest?: { runId?: { not?: string } } } }) => {
      const excludeRunId = where?.digest?.runId?.not;
      const seen = new Set<string>();
      const out: { daId: string }[] = [];
      for (const r of rows) {
        if (excludeRunId && r.runId === excludeRunId) continue;
        if (seen.has(r.daId)) continue;
        seen.add(r.daId);
        out.push({ daId: r.daId });
      }
      return Promise.resolve(out);
    },
  );
  return { digestDaRows: rows, findManyMock: findMany };
});

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    digestDa: { findMany: findManyMock },
    $queryRaw: vi
      .fn()
      .mockResolvedValue([{ saved_query_embedding: `[${Array(1536).fill(0).join(",")}]` }]),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

const ruleFilterMock = vi.fn().mockResolvedValue([]);
vi.mock("@/modules/relevance/filters", () => ({ ruleFilter: ruleFilterMock }));
vi.mock("@/modules/relevance/vector", () => ({
  vectorRank: vi.fn().mockResolvedValue([]),
}));

import { db } from "@/lib/db";

const CURRENT_RUN = "run-current";
const PRIOR_RUN = "run-prior";

function seedUser() {
  (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "u1",
    savedQueryText: "roofing",
    savedQueryEmbedding: Array(1536).fill(0),
    lgaBundles: [{ bundle: { lgas: [{ id: "blacktown" }] } }],
  });
}

/** The excludeDaIds argument the relevance run handed to the rule filter. */
function excludeDaIdsPassedToRuleFilter(): string[] {
  return ruleFilterMock.mock.calls.at(-1)?.[0]?.excludeDaIds ?? [];
}

beforeEach(() => {
  vi.clearAllMocks();
  digestDaRows.length = 0;
  ruleFilterMock.mockResolvedValue([]);
  seedUser();
});

describe("loadPastDigestDaIds — current-run exclusion (issue #124)", () => {
  it("does NOT dedupe against this run's own persisted leads on the retry tick", async () => {
    // Primary tick already persisted 8 leads for THIS run.
    for (let i = 1; i <= 8; i++) digestDaRows.push({ daId: `L${i}`, runId: CURRENT_RUN });

    const { runRelevanceForUser } = await import("@/modules/relevance/run");
    await runRelevanceForUser("u1", CURRENT_RUN);

    // Query scoped to OTHER runs only …
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { digest: { userId: "u1", runId: { not: CURRENT_RUN } } },
      }),
    );
    // … so none of the 8 own leads are excluded — the retry re-surfaces them.
    expect(excludeDaIdsPassedToRuleFilter()).toEqual([]);
  });

  it("still excludes leads shown in a PRIOR run", async () => {
    digestDaRows.push({ daId: "P1", runId: PRIOR_RUN });
    digestDaRows.push({ daId: "P2", runId: PRIOR_RUN });
    // This week's own leads must not be excluded even alongside prior ones.
    digestDaRows.push({ daId: "L1", runId: CURRENT_RUN });

    const { runRelevanceForUser } = await import("@/modules/relevance/run");
    await runRelevanceForUser("u1", CURRENT_RUN);

    const excluded = excludeDaIdsPassedToRuleFilter();
    expect(excluded).toEqual(expect.arrayContaining(["P1", "P2"]));
    expect(excluded).not.toContain("L1");
  });

  it("excludes ALL past leads when no runId is supplied (preview / legacy path)", async () => {
    digestDaRows.push({ daId: "P1", runId: PRIOR_RUN });
    digestDaRows.push({ daId: "L1", runId: CURRENT_RUN });

    const { runRelevanceForUser } = await import("@/modules/relevance/run");
    await runRelevanceForUser("u1"); // no runId — every prior lead deduped

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { digest: { userId: "u1" } } }),
    );
    expect(excludeDaIdsPassedToRuleFilter()).toEqual(
      expect.arrayContaining(["P1", "L1"]),
    );
  });
});
