// Unit tests for GET /api/export/digest/[id].csv (issue #22).
// Mocks the session, loader and limiter so the route's auth / ownership /
// rate-limit branching is exercised without a database.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DigestDetail } from "@/modules/portal/loaders";

const validateRequest = vi.fn();
const rateLimitMutatingByUser = vi.fn();
const getDigestById = vi.fn();

vi.mock("@/lib/auth/session", () => ({ validateRequest: () => validateRequest() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  rateLimitMutatingByUser: (u: string, r: string) => rateLimitMutatingByUser(u, r),
}));
vi.mock("@/modules/portal/loaders", () => ({
  getDigestById: (u: string, id: string) => getDigestById(u, id),
}));

import { GET } from "@/app/api/export/digest/[id]/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const sampleDigest: DigestDetail = {
  id: "dg_owned",
  sentAt: "2026-07-05T09:00:00.000Z",
  daCount: 1,
  emailStatus: "sent",
  smsStatus: null,
  fallbackUsed: false,
  runDate: "2026-07-05",
  leadClassCounts: { fast_track: 0, strata_heritage: 0, builder_pipeline: 1 },
  cards: [
    {
      daId: "da_1",
      rank: 1,
      relevanceScore: 0.9,
      whyMatched: "roofing",
      leadClass: "builder_pipeline",
      constructionCertifiedAt: null,
      address: "1 Smith St",
      council: "Inner West",
      estimatedValue: 100000,
      portalUrl: "https://portal/da/1",
      applicantName: "Acme",
      description: "reroof",
      lodgementDate: "2026-06-30",
      userFeedback: "up",
    },
  ],
};

beforeEach(() => {
  validateRequest.mockReset();
  rateLimitMutatingByUser.mockReset();
  getDigestById.mockReset();
  rateLimitMutatingByUser.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
});

const req = new Request("http://localhost/api/export/digest/x.csv");

describe("GET /api/export/digest/[id].csv", () => {
  it("401s when unauthenticated", async () => {
    validateRequest.mockResolvedValue(null);
    const res = await GET(req, ctx("dg_owned.csv"));
    expect(res.status).toBe(401);
    expect(getDigestById).not.toHaveBeenCalled();
  });

  it("429s when the limiter denies", async () => {
    validateRequest.mockResolvedValue({ user: { id: "u1" } });
    rateLimitMutatingByUser.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });
    const res = await GET(req, ctx("dg_owned.csv"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(getDigestById).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the session user and 404s on a non-owned digest", async () => {
    validateRequest.mockResolvedValue({ user: { id: "u1" } });
    getDigestById.mockResolvedValue(null); // loader is user-scoped → not found
    const res = await GET(req, ctx("dg_someone_else.csv"));
    expect(res.status).toBe(404);
    // Ownership is enforced by passing the authed user id, and `.csv` is stripped.
    expect(getDigestById).toHaveBeenCalledWith("u1", "dg_someone_else");
  });

  it("streams CSV with download headers for an owned digest", async () => {
    validateRequest.mockResolvedValue({ user: { id: "u1" } });
    getDigestById.mockResolvedValue(sampleDigest);
    const res = await GET(req, ctx("dg_owned.csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="pi-au-digest-2026-07-05.csv"',
    );
    const body = await res.text();
    expect(body.split("\r\n")[0]).toContain("Address");
    expect(body).toContain("1 Smith St");
    expect(body).toContain("Thumbs up");
  });

  it("also accepts an id without the .csv suffix", async () => {
    validateRequest.mockResolvedValue({ user: { id: "u1" } });
    getDigestById.mockResolvedValue(sampleDigest);
    const res = await GET(req, ctx("dg_owned"));
    expect(res.status).toBe(200);
    expect(getDigestById).toHaveBeenCalledWith("u1", "dg_owned");
  });
});
