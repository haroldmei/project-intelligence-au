// Issue #57 (FR-031): selecting LGA bundles is the activation step of the
// funnel — updateLgaBundles must emit `lga_bundle_selected` with the count of
// bundles chosen (and nothing more — no bundle ids, no PII). Fully mocked DB
// and analytics; no network, no Prisma.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, captureServerMock } = vi.hoisted(() => ({
  mockDb: {
    lgaBundleSubscription: { deleteMany: vi.fn(), createMany: vi.fn() },
    user: { findUniqueOrThrow: vi.fn() },
  },
  captureServerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/analytics/server", () => ({ captureServer: captureServerMock }));
// updateLgaBundles doesn't touch these, but the module imports them at top.
vi.mock("@/lib/ai/embeddings", () => ({ embed: vi.fn() }));
vi.mock("@/modules/billing/stripe", () => ({
  getActiveSubscription: vi.fn(),
  cancelSubscriptionAtPeriodEnd: vi.fn(),
}));

import { updateLgaBundles } from "@/modules/account/service";

const USER_ROW = {
  id: "user-1",
  email: "tradie@example.com",
  mobile_e164: "+61400000001",
  emailVerified: true,
  smsOptIn: false,
  stormBriefOptIn: false,
  trade: "roofing",
  subscriptionStatus: "trial",
  accessUntil: null,
  plan: null,
  cancelAtPeriodEnd: false,
  savedQueryText: null,
  lgaBundles: [{ bundleId: "inner-west" }, { bundleId: "eastern-suburbs" }],
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.lgaBundleSubscription.deleteMany.mockResolvedValue({ count: 0 });
  mockDb.lgaBundleSubscription.createMany.mockResolvedValue({ count: 2 });
  mockDb.user.findUniqueOrThrow.mockResolvedValue(USER_ROW);
});

describe("updateLgaBundles — lga_bundle_selected event", () => {
  it("emits lga_bundle_selected with the number of bundles chosen", async () => {
    await updateLgaBundles("user-1", ["inner-west", "eastern-suburbs"]);
    expect(captureServerMock).toHaveBeenCalledTimes(1);
    expect(captureServerMock).toHaveBeenCalledWith("user-1", "lga_bundle_selected", {
      bundleCount: 2,
    });
  });

  it("reports bundleCount 0 when the user clears their selection", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue({ ...USER_ROW, lgaBundles: [] });
    await updateLgaBundles("user-1", []);
    expect(captureServerMock).toHaveBeenCalledWith("user-1", "lga_bundle_selected", {
      bundleCount: 0,
    });
  });

  it("carries only the count — no bundle ids or PII in the event payload", async () => {
    await updateLgaBundles("user-1", ["inner-west", "eastern-suburbs"]);
    const [, , props] = captureServerMock.mock.calls[0];
    expect(props).toEqual({ bundleCount: 2 });
    expect(JSON.stringify(props)).not.toMatch(/inner-west|@|tradie/i);
  });
});
