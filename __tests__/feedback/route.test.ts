// GET /api/feedback/[token] route handler — redirect + fallback target URLs.
// Regression for issue #55: the handler used to point at /portal, which is a
// Next.js route group (mounted at /digest, /history, /account) and NOT a real
// URL — every feedback tap 404'd. Every terminal state must land on /digest.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { issueFeedbackToken } from "@/lib/hmac/token";

const recordFeedback = vi.fn();
const captureServer = vi.fn();

vi.mock("@/modules/feedback/service", () => ({
  recordFeedback: (...args: unknown[]) => recordFeedback(...args),
}));
vi.mock("@/lib/analytics/server", () => ({
  captureServer: (...args: unknown[]) => captureServer(...args),
}));

// Imported after the mocks are registered.
import { GET } from "@/app/api/feedback/[token]/route";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL!; // "http://localhost:3000"

function call(token: string) {
  return GET(new Request(`${APP_BASE}/api/feedback/${token}`), {
    params: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  recordFeedback.mockReset().mockResolvedValue(undefined);
  captureServer.mockReset();
});

describe("GET /api/feedback/[token] — no /portal 404", () => {
  it("redirects a valid tap to /digest (not /portal) with the feedback toast param", async () => {
    const token = issueFeedbackToken("user-1", "da-abc", 1);
    const res = await call(token);

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith(`${APP_BASE}/digest?`)).toBe(true);
    expect(location).not.toContain("/portal");
    expect(location).toContain("feedback=recorded");
    expect(location).toContain("daId=da-abc");
    expect(location).toContain("vote=up");
    expect(recordFeedback).toHaveBeenCalledWith("user-1", "da-abc", "up", "email");
  });

  it("still records feedback then redirects even if recordFeedback throws", async () => {
    recordFeedback.mockRejectedValueOnce(new Error("db down"));
    const token = issueFeedbackToken("user-2", "da-xyz", 0);
    const res = await call(token);

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith(`${APP_BASE}/digest?`)).toBe(true);
    expect(location).not.toContain("/portal");
    expect(location).toContain("vote=down");
  });

  it("expired-link fallback links to /digest, never /portal", async () => {
    // Forge a token issued 8 days ago (outside the 7-day window).
    const { createHmac } = await import("node:crypto");
    const payload = {
      userId: "u1",
      daId: "da1",
      vote: 1 as const,
      issuedAt: Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60,
    };
    const data = JSON.stringify(payload);
    const sig = createHmac("sha256", process.env.FEEDBACK_HMAC_SECRET!)
      .update(data)
      .digest("hex");
    const token = Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");

    const res = await call(token);
    expect(res.status).toBe(410);
    const body = await res.text();
    expect(body).toContain(`href="${APP_BASE}/digest"`);
    expect(body).not.toContain("/portal");
    expect(recordFeedback).not.toHaveBeenCalled();
  });

  it("invalid-link fallback links to /digest, never /portal", async () => {
    const res = await call("not-a-valid-token!!");
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain(`href="${APP_BASE}/digest"`);
    expect(body).not.toContain("/portal");
    expect(recordFeedback).not.toHaveBeenCalled();
  });
});
