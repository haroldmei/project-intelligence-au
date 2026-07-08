// Acceptance test — isUserEntitled portal loader delegates correctly to
// isDigestEntitled for a trial user past the entitlement window (issue #236).
// Uses the real test Postgres like the other portal loader tests.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, testDb } from "../setup-test-db";
import { isUserEntitled } from "@/modules/portal/loaders";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("isUserEntitled portal loader", () => {
  it("returns true for an active subscriber", async () => {
    const user = await testDb.user.create({
      data: {
        email: "active@example.com",
        passwordHash: "hashed",
        mobile_e164: "+61400000001",
        trade: "roofing",
        emailVerified: true,
        subscriptionStatus: "active",
      },
    });
    expect(await isUserEntitled(user.id)).toBe(true);
  });

  it("returns false for a lapsed self-signup trial (no Stripe sub, past trialDays)", async () => {
    // A user created 60 days ago — well past the 28-day trialDays window.
    const createdAt = new Date(Date.now() - 60 * 86_400_000);
    const user = await testDb.user.create({
      data: {
        email: "lapsed@example.com",
        passwordHash: "hashed",
        mobile_e164: "+61400000002",
        trade: "roofing",
        emailVerified: true,
        subscriptionStatus: "trial",
        accessUntil: null,
        createdAt,
      },
    });
    expect(await isUserEntitled(user.id)).toBe(false);
  });

  it("returns true for a self-signup trial still within the trialDays window", async () => {
    // A user created 1 day ago — still within the 28-day trial window.
    const createdAt = new Date(Date.now() - 86_400_000);
    const user = await testDb.user.create({
      data: {
        email: "within-trial@example.com",
        passwordHash: "hashed",
        mobile_e164: "+61400000003",
        trade: "roofing",
        emailVerified: true,
        subscriptionStatus: "trial",
        accessUntil: null,
        createdAt,
      },
    });
    expect(await isUserEntitled(user.id)).toBe(true);
  });

  it("returns false for a cancelled user", async () => {
    const user = await testDb.user.create({
      data: {
        email: "cancelled@example.com",
        passwordHash: "hashed",
        mobile_e164: "+61400000004",
        trade: "roofing",
        emailVerified: true,
        subscriptionStatus: "cancelled",
      },
    });
    expect(await isUserEntitled(user.id)).toBe(false);
  });

  it("returns false for a non-existent user id", async () => {
    expect(await isUserEntitled("nonexistent-id")).toBe(false);
  });
});
