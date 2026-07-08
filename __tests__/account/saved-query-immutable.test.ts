// FR-015 acceptance: saved-query text cannot be mutated post-signup in V1.
// The PUT handler returns 403 Forbidden. Custom saved queries are FR-V2-001
// ([Out-of-wedge → V2]). The pre-seeded roofing vocabulary embedding is set
// at account creation via seedDefaultSavedQuery (signup route).
import { describe, it, expect, vi } from "vitest";

const { validateRequestMock } = vi.hoisted(() => ({
  validateRequestMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ validateRequest: validateRequestMock }));
vi.mock("@/modules/account/service", () => ({
  getAccount: vi.fn().mockResolvedValue({ savedQueryText: "test" }),
}));

import { PUT, GET } from "@/app/api/account/saved-query/route";

describe("PUT /api/account/saved-query — FR-015 immutability", () => {
  it("returns 403 when a logged-in user tries to update the saved query", async () => {
    validateRequestMock.mockResolvedValue({ user: { id: "user-1" } });
    const response = await PUT();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("Saved query cannot be changed in V1");
  });

  it("returns 401 when an unauthenticated user tries to update the saved query", async () => {
    validateRequestMock.mockResolvedValue(null);
    const response = await PUT();
    expect(response.status).toBe(401);
  });
});

describe("GET /api/account/saved-query — FR-015 read-only", () => {
  it("returns the saved query text for an authenticated user", async () => {
    validateRequestMock.mockResolvedValue({ user: { id: "user-1" } });
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.saved_query_text).toBe("test");
  });

  it("returns 401 when unauthenticated", async () => {
    validateRequestMock.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
