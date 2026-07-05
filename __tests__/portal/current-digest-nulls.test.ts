// Acceptance test for issue #165 against the REAL portal loaders + Postgres.
//
// The bug: getCurrentDigest / getDigestHistory order by `sentAt DESC` without
// excluding (or last-ordering) rows whose sentAt IS NULL. A "skipped" audit
// Digest — a subscriber who cleared every LGA bundle, or a doubly-failed week
// (src/modules/digest/cron.ts recordAuditDigest) — is persisted with
// sentAt = null. Postgres defaults to NULLS FIRST on a DESC order, so that
// empty audit row sorts AHEAD of the user's real most-recent delivered digest:
// findFirst returns the 0-card stub as the "current" digest and history lists
// it atop the list, permanently masking the actual latest delivery.
//
// These exercise the real loaders against the test Postgres (the fix must hold
// at the DB layer — a mock can't reproduce NULLS FIRST) and assert the audit
// row never masquerades as the current/most-recent digest.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, testDb } from "../setup-test-db";
import { getCurrentDigest, getDigestHistory } from "@/modules/portal/loaders";

/** A user with the minimum fields the loaders' joins touch. */
async function seedUser(): Promise<string> {
  const user = await testDb.user.create({
    data: {
      email: "issue-165@example.com",
      passwordHash: "hashed",
      mobile_e164: "+61400000001",
      trade: "roofing",
      emailVerified: true,
      subscriptionStatus: "active",
    },
  });
  return user.id;
}

/** Create a DigestRun for a given week and return its id. */
async function seedRun(runDate: string): Promise<string> {
  const run = await testDb.digestRun.create({
    data: { runDate: new Date(runDate), status: "done" },
  });
  return run.id;
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("portal loaders — issue #165 null sentAt audit rows", () => {
  it("getCurrentDigest returns the most recent DELIVERED digest, not a later null-sentAt audit stub", async () => {
    const userId = await seedUser();

    // An earlier, real delivery.
    const deliveredRun = await seedRun("2026-06-21");
    await testDb.digest.create({
      data: {
        userId,
        runId: deliveredRun,
        sentAt: new Date("2026-06-21T09:00:00Z"),
        daCount: 5,
        emailStatus: "sent",
        areaLabel: "Western Sydney",
      },
    });

    // A LATER week that produced a skipped audit stub: sentAt null, 0 cards.
    const auditRun = await seedRun("2026-06-28");
    await testDb.digest.create({
      data: {
        userId,
        runId: auditRun,
        sentAt: null,
        daCount: 0,
        areaLabel: null,
      },
    });

    const current = await getCurrentDigest(userId);
    // Without the fix, NULLS FIRST returns the audit row: daCount 0, cards [].
    expect(current).not.toBeNull();
    expect(current?.daCount).toBe(5);
    expect(current?.cards).toHaveLength(0); // no DigestDa rows seeded, but it's the delivered row
    expect(current?.sentAt).toBe("2026-06-21T09:00:00.000Z");
  });

  it("getCurrentDigest returns null when the user has ONLY a null-sentAt audit stub", async () => {
    const userId = await seedUser();
    const auditRun = await seedRun("2026-06-28");
    await testDb.digest.create({
      data: { userId, runId: auditRun, sentAt: null, daCount: 0 },
    });

    // A never-delivered stub must not render as an empty "current" digest.
    expect(await getCurrentDigest(userId)).toBeNull();
  });

  it("getDigestHistory orders delivered digests ahead of never-sent audit rows", async () => {
    const userId = await seedUser();

    const olderRun = await seedRun("2026-06-14");
    await testDb.digest.create({
      data: {
        userId,
        runId: olderRun,
        sentAt: new Date("2026-06-14T09:00:00Z"),
        daCount: 3,
      },
    });

    const newerRun = await seedRun("2026-06-21");
    await testDb.digest.create({
      data: {
        userId,
        runId: newerRun,
        sentAt: new Date("2026-06-21T09:00:00Z"),
        daCount: 7,
      },
    });

    // A later null-sentAt audit stub that must NOT lead the list.
    const auditRun = await seedRun("2026-06-28");
    await testDb.digest.create({
      data: { userId, runId: auditRun, sentAt: null, daCount: 0 },
    });

    const history = await getDigestHistory(userId);
    expect(history).toHaveLength(3);
    // Delivered rows, newest delivery first, ahead of the audit stub.
    expect(history[0].daCount).toBe(7);
    expect(history[1].daCount).toBe(3);
    expect(history[2].sentAt).toBeNull();
  });
});
