// Privacy Act erasure adversarial tests against src/modules/account/service.ts.
// Pure module-level tests — DB is mocked via vi.mock at the @/lib/db boundary.
// AT-005 FIX: deleteAccount now cancels Stripe subscription and is idempotent.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Tracking
const tracking = {
  deleteCalls: [] as string[],
  findUniqueCalls: [] as string[],
  shouldThrow: false as false | "FK" | "notfound",
  stripeGetSubCalled: false,
  stripeCancelCalled: false,
  stripeSubId: null as string | null,
};

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        tracking.deleteCalls.push(where.id);
        if (tracking.shouldThrow === "notfound") {
          throw new Error("Record to delete does not exist.");
        }
        if (tracking.shouldThrow === "FK") {
          throw new Error("Foreign key constraint failed");
        }
        return { id: where.id };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        tracking.findUniqueCalls.push(where.id);
        // Return a user with a stripe customer id (simulates paid user).
        return {
          stripeCustomerId: "cus_x",
        };
      }),
      findUniqueOrThrow: vi.fn(async () => ({
        id: "u1",
        email: "u@e.co",
        mobile_e164: null,
        emailVerified: true,
        smsOptIn: false,
        trade: "roofing",
        subscriptionStatus: "active",
        accessUntil: null,
        savedQueryText: null,
        createdAt: new Date(),
        lgaBundles: [],
        digests: [],
        daFeedback: [],
        aiCostLog: [],
        passwordHash: "secret-hash",
        savedQueryEmbedding: [0, 1, 2],
        stripeCustomerId: "cus_x",
      })),
    },
  },
}));

vi.mock("@/modules/billing/stripe", () => ({
  getActiveSubscription: vi.fn(async () => {
    tracking.stripeGetSubCalled = true;
    if (tracking.stripeSubId) {
      return { id: tracking.stripeSubId, status: "active", current_period_end: 9999999999, cancel_at_period_end: false };
    }
    return null;
  }),
  cancelSubscriptionAtPeriodEnd: vi.fn(async (subId: string) => {
    tracking.stripeCancelCalled = true;
    return { id: subId, status: "active", current_period_end: 9999999999, cancel_at_period_end: true };
  }),
}));

beforeEach(() => {
  tracking.deleteCalls = [];
  tracking.findUniqueCalls = [];
  tracking.shouldThrow = false;
  tracking.stripeGetSubCalled = false;
  tracking.stripeCancelCalled = false;
  tracking.stripeSubId = "sub_abc123";
});

describe("deleteAccount — adversarial", () => {
  it("calls db.user.delete with the userId (relies on cascade for cleanup)", async () => {
    const { deleteAccount } = await import("@/modules/account/service");
    await deleteAccount("u-target");
    expect(tracking.deleteCalls).toContain("u-target");
  });

  it("AT-005 FIX: re-call after first delete is now idempotent — does NOT throw", async () => {
    // AT-005b fix: P2025/not-found is caught and silently returns (idempotent).
    const { deleteAccount } = await import("@/modules/account/service");
    await deleteAccount("u-target");
    tracking.shouldThrow = "notfound";
    // Second call must resolve cleanly — no 500 to client.
    await expect(deleteAccount("u-target")).resolves.toBeUndefined();
  });

  it("AT-005 FIX: cancels Stripe subscription before deletion (billing stops on erasure)", async () => {
    // AT-005a fix: deleteAccount now calls getActiveSubscription + cancelSubscriptionAtPeriodEnd.
    tracking.stripeSubId = "sub_live_xyz";
    const { deleteAccount } = await import("@/modules/account/service");
    await deleteAccount("u-target");
    expect(tracking.stripeGetSubCalled).toBe(true);
    expect(tracking.stripeCancelCalled).toBe(true);
    expect(tracking.deleteCalls).toContain("u-target");
  });

  it("AT-005 FIX: Stripe cancellation failure does NOT prevent erasure (preview-tier tolerance)", async () => {
    // Preview-tier: if Stripe call fails, log and proceed — do NOT 500.
    const { getActiveSubscription } = await import("@/modules/billing/stripe");
    (getActiveSubscription as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Stripe timeout"));
    const { deleteAccount } = await import("@/modules/account/service");
    // Should resolve — not throw — even if Stripe is down.
    await expect(deleteAccount("u-target")).resolves.toBeUndefined();
    // User row is still deleted.
    expect(tracking.deleteCalls).toContain("u-target");
  });

  it("AT-005 FIX: no Stripe call if user has no stripeCustomerId (trial users)", async () => {
    // If stripeCustomerId is null, we skip Stripe entirely.
    const { db } = await import("@/lib/db");
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ stripeCustomerId: null });
    tracking.stripeGetSubCalled = false;
    const { deleteAccount } = await import("@/modules/account/service");
    await deleteAccount("u-trial");
    expect(tracking.stripeGetSubCalled).toBe(false);
    expect(tracking.deleteCalls).toContain("u-trial");
  });

  it("propagates FK errors (cascade misconfigured)", async () => {
    const { deleteAccount } = await import("@/modules/account/service");
    tracking.shouldThrow = "FK";
    // If a future schema change misses an onDelete: Cascade, the user
    // erasure will fail. Test exists to encode the spec invariant.
    await expect(deleteAccount("u-stuck")).rejects.toThrow(/Foreign key/);
  });
});

describe("exportAccountData — adversarial", () => {
  it("strips passwordHash, savedQueryEmbedding, stripeCustomerId from export", async () => {
    const { exportAccountData } = await import("@/modules/account/service");
    const data = await exportAccountData("u1");
    expect(data["passwordHash"]).toBeUndefined();
    expect(data["savedQueryEmbedding"]).toBeUndefined();
    expect(data["stripeCustomerId"]).toBeUndefined();
  });

  it("includes data the user is entitled to (email, lgaBundles, digests, etc.)", async () => {
    const { exportAccountData } = await import("@/modules/account/service");
    const data = await exportAccountData("u1");
    expect(data["email"]).toBe("u@e.co");
    expect(data["lgaBundles"]).toBeDefined();
  });
});
