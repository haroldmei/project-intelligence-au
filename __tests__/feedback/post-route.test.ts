// Integration tests for POST /api/feedback — portal thumb up/down.
// Regression for issue #247: unknown da_id must return 4xx, never 500.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import { recordFeedback } from "@/modules/feedback/service";

// Mock auth before importing the route handler.
const validateRequest = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  validateRequest: () => validateRequest(),
}));

// Imported after mocks are registered.
import { POST } from "@/app/api/feedback/route";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL!;

function post(body: unknown) {
  return POST(
    new Request(`${APP_BASE}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

let userId: string;

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
  userId = await seedTestUser();
  validateRequest.mockReset().mockResolvedValue({ user: { id: userId }, session: {} });
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

describe("POST /api/feedback — unknown da_id (issue #247)", () => {
  it('returns 404 when da_id does not reference any DevelopmentApplication', async () => {
    const res = await post({ da_id: "does-not-exist", feedback: "up" });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Development application not found");
  });

  it('returns 404 for "down" vote on unknown da_id', async () => {
    const res = await post({ da_id: "nonexistent", feedback: "down" });

    expect(res.status).toBe(404);
  });

  it("does not create a DaFeedback row for an unknown da_id", async () => {
    await post({ da_id: "does-not-exist", feedback: "up" });

    const count = await testDb.daFeedback.count();
    expect(count).toBe(0);
  });

  it("creates a DaFeedback row for a valid da_id", async () => {
    const daId = await seedDA("blacktown");

    const res = await post({ da_id: daId, feedback: "up" });

    expect(res.status).toBe(200);
    const row = await testDb.daFeedback.findFirst({ where: { userId, daId } });
    expect(row?.feedback).toBe("up");
  });

  it("handles remove for a valid da_id gracefully", async () => {
    const daId = await seedDA("parramatta");

    // First create a row via the service (need real user FK)
    await recordFeedback(userId, daId, "up", "portal");

    // Then remove via POST
    const res = await post({ da_id: daId, feedback: "remove" });
    expect(res.status).toBe(200);

    const count = await testDb.daFeedback.count({ where: { userId, daId } });
    expect(count).toBe(0);
  });

  it("rejects unauthenticated requests with 401", async () => {
    validateRequest.mockResolvedValueOnce(null);

    const res = await post({ da_id: "irrelevant", feedback: "up" });
    expect(res.status).toBe(401);
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await POST(
      new Request(`${APP_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing da_id with 422", async () => {
    const res = await post({ feedback: "up" });
    expect(res.status).toBe(422);
  });

  it("rejects invalid feedback value with 422", async () => {
    const daId = await seedDA("blacktown");
    const res = await post({ da_id: daId, feedback: "invalid" });
    expect(res.status).toBe(422);
  });
});
