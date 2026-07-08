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

  // Issue #134: deleteMany + createMany used to run as two un-transactioned awaits.
  // An id that doesn't reference a real LgaBundle row (a stale/bogus id) threw
  // P2003 from createMany AFTER deleteMany had already wiped the user's coverage,
  // stranding them with ZERO subscriptions and silently dropping them from the
  // Sunday digest. The fix validates ids up front AND wraps the replace in a
  // transaction, so a bad id can never destroy existing coverage.
  it("rejects an unknown bundle id and leaves existing subscriptions intact (#134)", async () => {
    const userId = await seedTestUser();
    await testDb.lgaBundleSubscription.create({ data: { userId, bundleId: "western_sydney" } });
    await testDb.lgaBundleSubscription.create({ data: { userId, bundleId: "inner_west" } });

    const { updateLgaBundles, UnknownLgaBundleError } = await import("@/modules/account/service");
    await expect(
      updateLgaBundles(userId, ["nonexistent-bundle-id"]),
    ).rejects.toBeInstanceOf(UnknownLgaBundleError);

    // The prior valid coverage must survive — no partial wipe.
    const subs = await testDb.lgaBundleSubscription.findMany({ where: { userId }, orderBy: { bundleId: "asc" } });
    expect(subs.map((s) => s.bundleId)).toEqual(["inner_west", "western_sydney"]);
  });

  it("rejects when only SOME ids are unknown and leaves coverage intact (#134)", async () => {
    const userId = await seedTestUser();
    await testDb.lgaBundleSubscription.create({ data: { userId, bundleId: "western_sydney" } });

    const { updateLgaBundles, UnknownLgaBundleError } = await import("@/modules/account/service");
    // One valid, one bogus — the whole replace must be rejected atomically.
    await expect(
      updateLgaBundles(userId, ["inner_west", "nope"]),
    ).rejects.toBeInstanceOf(UnknownLgaBundleError);

    const subs = await testDb.lgaBundleSubscription.findMany({ where: { userId } });
    expect(subs).toHaveLength(1);
    expect(subs[0].bundleId).toBe("western_sydney");
  });

  it("swaps a multi-bundle selection atomically for all-valid ids (#134)", async () => {
    const userId = await seedTestUser();
    await testDb.lgaBundleSubscription.create({ data: { userId, bundleId: "western_sydney" } });

    const { updateLgaBundles } = await import("@/modules/account/service");
    const account = await updateLgaBundles(userId, ["inner_west", "western_sydney"]);

    expect(account.lgaBundles.sort()).toEqual(["inner_west", "western_sydney"]);
    const subs = await testDb.lgaBundleSubscription.findMany({ where: { userId } });
    expect(subs).toHaveLength(2);
  });
});

describe("updateProfile", () => {
  it("sets the mobile number when a valid E.164 string is given", async () => {
    const userId = await seedTestUser();
    const { updateProfile } = await import("@/modules/account/service");
    const account = await updateProfile(userId, { mobile_e164: "+61400000009" });
    expect(account.mobile_e164).toBe("+61400000009");
  });

  it("leaves the mobile untouched when the key is omitted (undefined)", async () => {
    const userId = await seedTestUser({ mobile: "+61400000010" });
    const { updateProfile } = await import("@/modules/account/service");
    const account = await updateProfile(userId, {});
    expect(account.mobile_e164).toBe("+61400000010");
  });

  // Issue #166: clearing the field used to silently no-op — `? {..} : {}` treated
  // an explicit removal (null) the same as "not submitted". A null must actually
  // wipe the column so the UI's "Saved." is truthful.
  it("removes the mobile number when passed null (#166)", async () => {
    const userId = await seedTestUser({ mobile: "+61400000011" });
    const { updateProfile } = await import("@/modules/account/service");
    const account = await updateProfile(userId, { mobile_e164: null });
    expect(account.mobile_e164).toBeNull();

    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.mobile_e164).toBeNull();
  });

  it("clears smsOptIn when the mobile is removed (#166)", async () => {
    const userId = await seedTestUser({ mobile: "+61400000012" });
    await testDb.user.update({ where: { id: userId }, data: { smsOptIn: true } });

    const { updateProfile } = await import("@/modules/account/service");
    const account = await updateProfile(userId, { mobile_e164: null });
    expect(account.mobile_e164).toBeNull();
    expect(account.smsOptIn).toBe(false);
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

  it("defaults smsOptIn=true for a user created without setting it (issue #89)", async () => {
    // The schema/column default is ON: a signup collects a required AU mobile
    // and is sold "Email + SMS", so a new account must be opted in (SF-3.4).
    const user = await testDb.user.create({
      data: {
        email: `default-sms-${Date.now()}@test.com`,
        passwordHash: "hashed",
        emailVerified: true,
        subscriptionStatus: "trial",
        mobile_e164: "+61400000004",
        trade: "roofing",
      },
    });
    expect(user.smsOptIn).toBe(true);
  });

  it("sets smsOptIn=false on opt-out", async () => {
    const userId = await seedTestUser({ mobile: "+61400000003" });
    await testDb.user.update({ where: { id: userId }, data: { smsOptIn: true } });
    const { smsOptOut } = await import("@/modules/account/service");
    const account = await smsOptOut(userId);
    expect(account.smsOptIn).toBe(false);
  });
});

describe("emailOptIn / emailOptOut (#105)", () => {
  it("re-enables emailOptIn after an unsubscribe left it false", async () => {
    const userId = await seedTestUser({});
    // Simulate the token unsubscribe having flipped the flag off.
    await testDb.user.update({ where: { id: userId }, data: { emailOptIn: false } });

    const { emailOptIn } = await import("@/modules/account/service");
    const account = await emailOptIn(userId);

    expect(account.emailOptIn).toBe(true);
    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.emailOptIn).toBe(true);
  });

  it("sets emailOptIn=false on opt-out", async () => {
    const userId = await seedTestUser({});
    const { emailOptOut } = await import("@/modules/account/service");
    const account = await emailOptOut(userId);

    expect(account.emailOptIn).toBe(false);
    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.emailOptIn).toBe(false);
  });

  it("surfaces emailOptIn in the account DTO so the portal can render the toggle", async () => {
    const userId = await seedTestUser({});
    const { getAccount } = await import("@/modules/account/service");
    const account = await getAccount(userId);
    expect(account?.emailOptIn).toBe(true); // schema default
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
