// Integration tests for the unauthenticated email-unsubscribe route (issue #23,
// hardened for RFC-8058 in issue #179).
//
// Spam Act 2003: the link must flip emailOptIn=false with no session. RFC-8058:
// the mutation happens ONLY on POST — a bare GET (what a mail-scanner prefetch
// issues) must NOT opt anyone out; it just renders a confirm interstitial.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import { issueUnsubscribeToken } from "@/lib/hmac/token";
import { GET, POST } from "@/app/api/unsubscribe/[token]/route";

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
});

afterAll(async () => {
  await testDb.$disconnect();
});

function ctx(token: string) {
  return { params: Promise.resolve({ token }) };
}

describe("GET /api/unsubscribe/[token] — prefetch-safe confirm interstitial", () => {
  it("a plain GET does NOT set emailOptIn=false (RFC-8058 / issue #179)", async () => {
    const userId = await seedTestUser({});
    const before = await testDb.user.findUnique({ where: { id: userId } });
    expect(before?.emailOptIn).toBe(true); // default

    const token = issueUnsubscribeToken(userId);
    const res = await GET(new Request("http://localhost:3000/api/unsubscribe/x"), ctx(token));
    expect(res.status).toBe(200);

    // The core of the bug: an automated GET (SafeLinks/Mimecast/Gmail proxy)
    // must leave the subscriber opted IN.
    const after = await testDb.user.findUnique({ where: { id: userId } });
    expect(after?.emailOptIn).toBe(true);

    // It renders a confirm form that POSTs back to the same endpoint.
    const body = await res.text();
    expect(body).toMatch(/method="POST"/i);
    expect(body).toContain(`/api/unsubscribe/${encodeURIComponent(token)}`);
    expect(body).toMatch(/unsubscribe/i);
  });

  it("rejects an invalid token on GET and leaves the flag unchanged", async () => {
    const userId = await seedTestUser({});
    const res = await GET(new Request("http://localhost:3000/api/unsubscribe/x"), ctx("garbage"));
    expect(res.status).toBe(400);

    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.emailOptIn).toBe(true);
  });
});

describe("POST /api/unsubscribe/[token] — the one-click opt-out", () => {
  it("flips emailOptIn=false without a session", async () => {
    const userId = await seedTestUser({});
    const before = await testDb.user.findUnique({ where: { id: userId } });
    expect(before?.emailOptIn).toBe(true); // default

    const token = issueUnsubscribeToken(userId);
    const res = await POST(new Request("http://localhost:3000/api/unsubscribe/x", { method: "POST" }), ctx(token));
    expect(res.status).toBe(200);

    const after = await testDb.user.findUnique({ where: { id: userId } });
    expect(after?.emailOptIn).toBe(false);

    // Issue #127: the confirmation must set the expectation that essential
    // billing notices (the pre-charge trial reminder) still arrive, so a
    // marketing opt-out never reads as "I'll never be charged without warning".
    const body = await res.text();
    expect(body).toMatch(/marketing emails/i);
    expect(body).toMatch(/billing notices/i);
  });

  it("rejects an invalid token on POST and leaves the flag unchanged", async () => {
    const userId = await seedTestUser({});
    const res = await POST(new Request("http://localhost:3000/api/unsubscribe/x", { method: "POST" }), ctx("garbage"));
    expect(res.status).toBe(400);

    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.emailOptIn).toBe(true);
  });

  it("is idempotent for an already-unsubscribed user", async () => {
    const userId = await seedTestUser({});
    await testDb.user.update({ where: { id: userId }, data: { emailOptIn: false } });
    const token = issueUnsubscribeToken(userId);
    const res = await POST(new Request("http://localhost:3000/api/unsubscribe/x", { method: "POST" }), ctx(token));
    expect(res.status).toBe(200);
    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.emailOptIn).toBe(false);
  });
});
