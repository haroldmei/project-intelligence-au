// Acceptance test for issue #87 against the REAL digest selection query.
// The bar (from the issue): "A trial user whose trial window (createdAt +
// PRICING.trialDays) has elapsed and who has no active Stripe subscription is
// NOT selected by the digest cron and does not receive the weekly digest."
//
// This exercises the exact user-selection query the digest cron runs
// (src/modules/digest/cron.ts — emailVerified + entitledDigestWhere + emailOptIn)
// against the real test Postgres, and asserts membership.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, testDb } from "../setup-test-db";
import { entitledDigestWhere } from "@/modules/billing/entitlement";
import { PRICING } from "@/lib/pricing";

const DAY = 86_400_000;

/**
 * Create a user with full control over the entitlement-relevant fields.
 * Defaults are a happy self-signup trial created just now.
 */
async function seedUser(overrides: {
  email: string;
  subscriptionStatus?: string;
  accessUntil?: Date | null;
  stripeCustomerId?: string | null;
  createdAtDaysAgo?: number;
  emailVerified?: boolean;
  emailOptIn?: boolean;
}): Promise<string> {
  const createdAt = new Date(Date.now() - (overrides.createdAtDaysAgo ?? 0) * DAY);
  const user = await testDb.user.create({
    data: {
      email: overrides.email,
      passwordHash: "hashed",
      mobile_e164: "+61400000001",
      trade: "roofing",
      emailVerified: overrides.emailVerified ?? true,
      emailOptIn: overrides.emailOptIn ?? true,
      subscriptionStatus: overrides.subscriptionStatus ?? "trial",
      accessUntil: overrides.accessUntil ?? null,
      stripeCustomerId: overrides.stripeCustomerId ?? null,
      createdAt,
    },
  });
  return user.id;
}

/** The exact where-clause the digest cron uses to pick subscribers. */
function selectEntitled() {
  return testDb.user.findMany({
    where: {
      emailVerified: true,
      ...entitledDigestWhere(),
      emailOptIn: true,
    },
    select: { id: true, email: true },
  });
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("digest selection — issue #87 entitlement window", () => {
  it("EXCLUDES an expired self-signup trial (createdAt + trialDays elapsed, no Stripe sub)", async () => {
    // The exact reproduction: trial, no accessUntil, no stripeCustomerId,
    // created 60 days ago (> 28-day trial). This user used to be selected and
    // handed the digest free forever.
    await seedUser({
      email: "expired-trial@x.com",
      createdAtDaysAgo: PRICING.trialDays + 32,
    });

    const selected = await selectEntitled();

    expect(selected.map((u) => u.email)).not.toContain("expired-trial@x.com");
    expect(selected).toHaveLength(0);
  });

  it("INCLUDES a self-signup trial still inside its trial window", async () => {
    await seedUser({ email: "fresh-trial@x.com", createdAtDaysAgo: 3 });

    const selected = await selectEntitled();

    expect(selected.map((u) => u.email)).toEqual(["fresh-trial@x.com"]);
  });

  it("INCLUDES an active (paying) subscriber regardless of account age", async () => {
    await seedUser({
      email: "paying@x.com",
      subscriptionStatus: "active",
      accessUntil: new Date(Date.now() + 20 * DAY),
      stripeCustomerId: "cus_123",
      createdAtDaysAgo: 400,
    });

    const selected = await selectEntitled();

    expect(selected.map((u) => u.email)).toEqual(["paying@x.com"]);
  });

  it("INCLUDES a Stripe-managed trial with accessUntil in the future, EXCLUDES one past it", async () => {
    await seedUser({
      email: "stripe-trial-live@x.com",
      subscriptionStatus: "trial",
      accessUntil: new Date(Date.now() + 10 * DAY),
      stripeCustomerId: "cus_live",
      createdAtDaysAgo: 5,
    });
    await seedUser({
      email: "stripe-trial-lapsed@x.com",
      subscriptionStatus: "trial",
      accessUntil: new Date(Date.now() - 2 * DAY),
      stripeCustomerId: "cus_lapsed",
      // Even a recent createdAt must not save it — accessUntil is authoritative
      // for a Stripe-managed trial.
      createdAtDaysAgo: 3,
    });

    const selected = await selectEntitled();
    const emails = selected.map((u) => u.email);

    expect(emails).toContain("stripe-trial-live@x.com");
    expect(emails).not.toContain("stripe-trial-lapsed@x.com");
  });

  it("keeps EXCLUDING a cancelled user even with a future access window", async () => {
    // A cancellation is terminal — accessUntil in the future must not save it.
    await seedUser({
      email: "cancelled@x.com",
      subscriptionStatus: "cancelled",
      accessUntil: new Date(Date.now() + 30 * DAY),
      createdAtDaysAgo: 1,
    });

    const selected = await selectEntitled();

    expect(selected).toHaveLength(0);
  });

  // Issue #106 — the acceptance criterion. A past_due subscriber is a paying
  // user in Stripe's multi-day smart-retry (dunning) window, not a cancellation:
  // include them through the already-paid window so the Sunday digest keeps
  // arriving (the one weekly touchpoint that prompts a card fix), while a
  // cancelled user past their window stays excluded.
  it("INCLUDES a past_due subscriber whose accessUntil is in the future (dunning window)", async () => {
    await seedUser({
      email: "dunning-live@x.com",
      subscriptionStatus: "past_due",
      accessUntil: new Date(Date.now() + 7 * DAY),
      stripeCustomerId: "cus_dunning",
      createdAtDaysAgo: 400,
    });
    await seedUser({
      email: "cancelled-lapsed@x.com",
      subscriptionStatus: "cancelled",
      accessUntil: new Date(Date.now() - 2 * DAY),
      createdAtDaysAgo: 1,
    });

    const selected = await selectEntitled();
    const emails = selected.map((u) => u.email);

    expect(emails).toContain("dunning-live@x.com");
    expect(emails).not.toContain("cancelled-lapsed@x.com");
  });

  it("EXCLUDES a past_due subscriber whose paid window has lapsed (or is absent)", async () => {
    // A lapsed access window means Stripe's retries have run past the period
    // they paid for — no longer entitled. A null accessUntil is anomalous for
    // past_due and is likewise excluded (defensive bound, not an unbounded grant).
    await seedUser({
      email: "dunning-lapsed@x.com",
      subscriptionStatus: "past_due",
      accessUntil: new Date(Date.now() - 1 * DAY),
      stripeCustomerId: "cus_lapsed_pd",
      createdAtDaysAgo: 400,
    });
    await seedUser({
      email: "dunning-null@x.com",
      subscriptionStatus: "past_due",
      accessUntil: null,
      createdAtDaysAgo: 1,
    });

    const selected = await selectEntitled();

    expect(selected).toHaveLength(0);
  });
});
