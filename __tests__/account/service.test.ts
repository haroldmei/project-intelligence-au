// Integration tests for src/modules/account/service.ts
// FR-020, FR-022 | system-design §4
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";

// Mock embeddings to avoid live OpenAI calls
vi.mock("@/lib/ai/embeddings", () => ({
  embed: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
}));

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
  vi.clearAllMocks();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("getAccount", () => {
  it("returns account DTO for a valid user", async () => {
    const userId = await seedTestUser({ email: "test@account.com" });
    const { getAccount } = await import("@/modules/account/service");
    const account = await getAccount(userId);
    expect(account).not.toBeNull();
    expect(account?.email).toBe("test@account.com");
  });

  it("returns null for unknown user", async () => {
    const { getAccount } = await import("@/modules/account/service");
    const account = await getAccount("nonexistent-id");
    expect(account).toBeNull();
  });
});

describe("updateLgaBundles", () => {
  it("replaces bundle subscriptions", async () => {
    const userId = await seedTestUser();
    await testDb.lgaBundleSubscription.create({ data: { userId, bundleId: "western_sydney" } });

    const { updateLgaBundles } = await import("@/modules/account/service");
    const account = await updateLgaBundles(userId, ["inner_west"]);

    expect(account.lgaBundles).toEqual(["inner_west"]);
    const subs = await testDb.lgaBundleSubscription.findMany({ where: { userId } });
    expect(subs).toHaveLength(1);
    expect(subs[0].bundleId).toBe("inner_west");
  });
});

describe("smsOptIn / smsOptOut", () => {
  it("sets smsOptIn=true when mobile is set", async () => {
    const userId = await seedTestUser({ mobile: "+61400000002" });
    const { smsOptIn } = await import("@/modules/account/service");
    const account = await smsOptIn(userId);
    expect(account.smsOptIn).toBe(true);
  });

  it("throws when mobile is not set", async () => {
    const user = await testDb.user.create({
      data: {
        email: `nomobile-${Date.now()}@test.com`,
        passwordHash: "hashed",
        emailVerified: true,
        subscriptionStatus: "active",
        trade: "roofing",
      },
    });
    const { smsOptIn } = await import("@/modules/account/service");
    await expect(smsOptIn(user.id)).rejects.toThrow("Mobile number required");
  });

  it("sets smsOptIn=false on opt-out", async () => {
    const userId = await seedTestUser({ mobile: "+61400000003" });
    await testDb.user.update({ where: { id: userId }, data: { smsOptIn: true } });
    const { smsOptOut } = await import("@/modules/account/service");
    const account = await smsOptOut(userId);
    expect(account.smsOptIn).toBe(false);
  });
});

describe("deleteAccount", () => {
  it("removes the user from the database", async () => {
    const userId = await seedTestUser();
    const { deleteAccount } = await import("@/modules/account/service");
    await deleteAccount(userId);
    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user).toBeNull();
  });
});
