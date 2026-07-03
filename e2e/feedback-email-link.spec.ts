/**
 * feedback-email-link.spec.ts
 *
 * Regression for issue #47 (a duplicate of the already-fixed #49): every 👍/👎
 * tap in the weekly digest email returned 405 and recorded nothing.
 *
 * Root cause: buildFeedbackUrl() (src/modules/digest/assemble.ts) emitted the
 * QUERY form `/api/feedback?token=…`, which Next.js resolves to the static
 * /api/feedback route — POST-only (Lucia portal), so GET → 405. The real
 * token-validating GET handler lives at the dynamic PATH segment
 * /api/feedback/[token]/route.ts and was never reached. The fix emits the path
 * form `/api/feedback/<token>` (mirroring buildUnsubscribeUrl).
 *
 * These are request-level checks driven against the REAL dev server — they
 * prove the Next.js ROUTING (the exact thing the vitest unit test cannot, since
 * it calls the handler function directly). The vitest round-trip
 * (__tests__/digest/assemble-feedback-link.test.ts) proves the DaFeedback row
 * is written; the portal UI persistence is covered by digest.spec.ts.
 */
import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

// FEEDBACK_HMAC_SECRET must match the dev server to mint a token it will accept.
// Skip the token test when it is not present in the Playwright process env.
const HMAC_SECRET = process.env.FEEDBACK_HMAC_SECRET;

// Mint a valid feedback token exactly as src/lib/hmac/token.ts does, WITHOUT
// importing app modules (that import triggers full env validation in this
// process, which needs DATABASE_URL et al.). Key order matches canonical().
function issueFeedbackToken(userId: string, daId: string, vote: 1 | 0): string {
  const payload = { userId, daId, vote, issuedAt: Math.floor(Date.now() / 1000) };
  const sig = createHmac("sha256", HMAC_SECRET!).update(JSON.stringify(payload)).digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

test.describe("digest email feedback link routing (issue #47)", () => {
  test("the query form the email used to emit returns 405 (the bug)", async ({ request }) => {
    // /api/feedback is the POST-only portal route; a GET (what the email link
    // did) 405s and the tap records nothing. This is the failure the fix removes.
    const res = await request.get("/api/feedback?token=irrelevant", { maxRedirects: 0 });
    expect(res.status()).toBe(405);
  });

  test("the path form buildFeedbackUrl now emits reaches the GET handler and 302s to /digest", async ({
    request,
  }) => {
    test.skip(!HMAC_SECRET, "Requires FEEDBACK_HMAC_SECRET in the Playwright env to mint a valid token");

    const token = issueFeedbackToken("user-e2e", "da-e2e", 1);
    // This is byte-for-byte the URL shape buildFeedbackUrl() produces.
    const res = await request.get(`/api/feedback/${encodeURIComponent(token)}`, { maxRedirects: 0 });

    expect(res.status()).toBe(302);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/digest?feedback=recorded");
    expect(location).toContain("vote=up");
  });

  test("a tampered token on the path form is rejected (400), never 405", async ({ request }) => {
    // Even the failure path must reach the [token] handler (400 fallback HTML),
    // proving the route resolves — a 405 here would mean the email link is dead.
    const res = await request.get("/api/feedback/not-a-valid-token", { maxRedirects: 0 });
    expect(res.status()).toBe(400);
  });
});
