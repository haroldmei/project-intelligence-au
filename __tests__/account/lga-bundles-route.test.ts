// PUT /api/account/lga-bundles route handler — error mapping.
// Issue #134: an unknown bundle id must produce a clean 422 client error, NOT
// an unhandled 500. The service rejects bad ids up front (before the
// transactional delete+create), and the route must translate that rejection
// into a 422 so the client sees "bad input", not "server broke". Fully mocked
// service/auth — no DB, no network.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { updateLgaBundlesMock, getAccountMock, UnknownLgaBundleError, validateRequestMock, rateLimitMock } =
  vi.hoisted(() => {
    class UnknownLgaBundleError extends Error {
      readonly bundleIds: string[];
      constructor(bundleIds: string[]) {
        super(`Unknown LGA bundle id(s): ${bundleIds.join(", ")}`);
        this.name = "UnknownLgaBundleError";
        this.bundleIds = bundleIds;
      }
    }
    return {
      updateLgaBundlesMock: vi.fn(),
      getAccountMock: vi.fn(),
      UnknownLgaBundleError,
      validateRequestMock: vi.fn(),
      rateLimitMock: vi.fn(),
    };
  });

vi.mock("@/modules/account/service", () => ({
  getAccount: getAccountMock,
  updateLgaBundles: updateLgaBundlesMock,
  UnknownLgaBundleError,
}));
vi.mock("@/lib/auth/session", () => ({ validateRequest: validateRequestMock }));
vi.mock("@/lib/auth/rate-limit", () => ({ rateLimitMutatingByUser: rateLimitMock }));

import { PUT } from "@/app/api/account/lga-bundles/route";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function put(body: unknown) {
  return PUT(
    new Request(`${APP_BASE}/api/account/lga-bundles`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockReturnValue({ allowed: true });
});

describe("PUT /api/account/lga-bundles — error mapping (#134)", () => {
  it("returns 422 (not 500) when the service rejects an unknown bundle id", async () => {
    updateLgaBundlesMock.mockRejectedValue(new UnknownLgaBundleError(["nope"]));

    const res = await put({ bundle_ids: ["nope"] });

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Unknown LGA bundle");
    expect(json.bundle_ids).toEqual(["nope"]);
  });

  it("returns 200 with the account for a valid replace", async () => {
    updateLgaBundlesMock.mockResolvedValue({ lgaBundles: ["inner_west"] });

    const res = await put({ bundle_ids: ["inner_west"] });

    expect(res.status).toBe(200);
    expect(updateLgaBundlesMock).toHaveBeenCalledWith("user-1", ["inner_west"]);
  });

  it("lets a non-bundle error propagate (real 500, not a swallowed 422)", async () => {
    updateLgaBundlesMock.mockRejectedValue(new Error("db down"));
    await expect(put({ bundle_ids: ["inner_west"] })).rejects.toThrow("db down");
  });
});
