// Integration tests for src/modules/feedback/service.ts
// Vitest + real Postgres test DB
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import { recordFeedback, removeFeedback } from "@/modules/feedback/service";

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
});

afterAll(async () => {
  await testDb.$disconnect();
});

async function seedDA(council: string): Promise<string> {
  const da = await testDb.developmentApplication.create({
    data: {
      daId: `TEST-${Date.now()}`,
      council,
      address: "1 Roof St",
      description: "Re-roofing existing dwelling",
      portalUrl: "https://example.com",
      lodgementDate: new Date(),
      sourceApi: "nsw_planning",
    },
  });
  return da.id;
}

describe("recordFeedback", () => {
  it("inserts a thumbs-up row", async () => {
    const userId = await seedTestUser();
    const daId = await seedDA("blacktown");

    await recordFeedback(userId, daId, "up", "portal");

    const row = await testDb.daFeedback.findFirst({ where: { userId, daId } });
    expect(row?.feedback).toBe("up");
    expect(row?.source).toBe("portal");
  });

  it("upserts on duplicate (portal undo to down)", async () => {
    const userId = await seedTestUser();
    const daId = await seedDA("blacktown");

    await recordFeedback(userId, daId, "up", "portal");
    await recordFeedback(userId, daId, "down", "email");

    const rows = await testDb.daFeedback.findMany({ where: { userId, daId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].feedback).toBe("down");
  });

  it("records email-source feedback", async () => {
    const userId = await seedTestUser();
    const daId = await seedDA("parramatta");

    await recordFeedback(userId, daId, "up", "email");

    const row = await testDb.daFeedback.findFirst({ where: { userId, daId } });
    expect(row?.source).toBe("email");
  });
});

describe("removeFeedback", () => {
  it("deletes an existing feedback row", async () => {
    const userId = await seedTestUser();
    const daId = await seedDA("blacktown");

    await recordFeedback(userId, daId, "up", "portal");
    await removeFeedback(userId, daId);

    const count = await testDb.daFeedback.count({ where: { userId, daId } });
    expect(count).toBe(0);
  });

  it("is idempotent when row does not exist", async () => {
    const userId = await seedTestUser();
    await expect(removeFeedback(userId, "nonexistent-da")).resolves.not.toThrow();
  });
});
