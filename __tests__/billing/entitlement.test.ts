// Entitlement gate unit tests (issue #87).
// The paid deliverable (weekly digest + storm brief) must be gated on an
// unexpired access WINDOW, not the subscriptionStatus string. A self-signup
// trial (accessUntil:null, no Stripe subscription) that is never converted must
// STOP receiving the product once createdAt + trialDays has elapsed — otherwise
// the AUD 99/mo product is free forever (the revenue leak this closes).
//
// Pure: no DB. Boundary behaviour of isDigestEntitled + the shape of the Prisma
// `where` fragment it mirrors.
import { describe, it, expect } from "vitest";
import {
  isDigestEntitled,
  entitledDigestWhere,
  TRIAL_WINDOW_MS,
} from "@/modules/billing/entitlement";
import { PRICING } from "@/lib/pricing";

const NOW = new Date("2026-07-03T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("TRIAL_WINDOW_MS", () => {
  it("is PRICING.trialDays expressed in ms", () => {
    expect(TRIAL_WINDOW_MS).toBe(PRICING.trialDays * 86_400_000);
  });
});

describe("isDigestEntitled", () => {
  it("active users are always entitled (Stripe owns the window)", () => {
    // Even with a stale/absent accessUntil and an ancient account, an active
    // subscriber is paying — never cut them off on a missed renewal webhook.
    expect(
      isDigestEntitled(
        { subscriptionStatus: "active", accessUntil: null, createdAt: daysAgo(999) },
        NOW,
      ),
    ).toBe(true);
  });

  it("Stripe-managed trial is entitled while accessUntil is in the future", () => {
    expect(
      isDigestEntitled(
        { subscriptionStatus: "trial", accessUntil: daysAhead(5), createdAt: daysAgo(400) },
        NOW,
      ),
    ).toBe(true);
  });

  it("Stripe-managed trial is NOT entitled once accessUntil has passed", () => {
    expect(
      isDigestEntitled(
        { subscriptionStatus: "trial", accessUntil: daysAgo(1), createdAt: daysAgo(1) },
        NOW,
      ),
    ).toBe(false);
  });

  it("self-signup trial is entitled inside the createdAt + trialDays window", () => {
    expect(
      isDigestEntitled(
        { subscriptionStatus: "trial", accessUntil: null, createdAt: daysAgo(1) },
        NOW,
      ),
    ).toBe(true);
  });

  it("THE BUG: self-signup trial past createdAt + trialDays is NOT entitled", () => {
    // 60-day-old trial, no Stripe subscription, no accessUntil — the exact
    // reproduction from issue #87. Previously handed the digest free forever.
    expect(
      isDigestEntitled(
        { subscriptionStatus: "trial", accessUntil: null, createdAt: daysAgo(60) },
        NOW,
      ),
    ).toBe(false);
  });

  it("self-signup trial exactly at the deadline is NOT entitled (deadline is exclusive)", () => {
    expect(
      isDigestEntitled(
        {
          subscriptionStatus: "trial",
          accessUntil: null,
          createdAt: new Date(NOW.getTime() - TRIAL_WINDOW_MS),
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("self-signup trial one second before the deadline is still entitled", () => {
    expect(
      isDigestEntitled(
        {
          subscriptionStatus: "trial",
          accessUntil: null,
          createdAt: new Date(NOW.getTime() - TRIAL_WINDOW_MS + 1000),
        },
        NOW,
      ),
    ).toBe(true);
  });

  it.each(["cancelled", "past_due", "expired", "anything-else"])(
    "%s is never entitled",
    (status) => {
      expect(
        isDigestEntitled(
          { subscriptionStatus: status, accessUntil: daysAhead(30), createdAt: daysAgo(1) },
          NOW,
        ),
      ).toBe(false);
    },
  );
});

describe("entitledDigestWhere", () => {
  it("mirrors isDigestEntitled: the self-signup-trial branch uses a now - trialDays cutoff", () => {
    const where = entitledDigestWhere(NOW);
    const or = where.OR as Array<Record<string, unknown>>;
    expect(or).toHaveLength(3);

    const selfSignup = or.find((c) => c.accessUntil === null);
    expect(selfSignup).toBeDefined();
    const createdAt = selfSignup!.createdAt as { gt: Date };
    expect(createdAt.gt.getTime()).toBe(NOW.getTime() - TRIAL_WINDOW_MS);
  });

  it("gates the Stripe-managed-trial branch on accessUntil > now", () => {
    const or = entitledDigestWhere(NOW).OR as Array<Record<string, unknown>>;
    const stripeTrial = or.find(
      (c) => c.subscriptionStatus === "trial" && typeof c.accessUntil === "object" && c.accessUntil !== null,
    );
    expect(stripeTrial!.accessUntil).toEqual({ gt: NOW });
  });
});
