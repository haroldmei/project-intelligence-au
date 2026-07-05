// Integration tests for the unauthenticated email-unsubscribe route (issue #23).
// Spam Act 2003: the link must flip emailOptIn=false with no session.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import { issueUnsubscribeToken } from "@/lib/hmac/token";
import { GET } from "@/app/api/unsubscribe/[token]/route";

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

describe("GET /api/unsubscribe/[token]", () => {
  it("flips emailOptIn=false without a session", async () => {
    const userId = await seedTestUser({});
    const before = await testDb.user.findUnique({ where: { id: userId } });
    expect(before?.emailOptIn).toBe(true); // default

    const token = issueUnsubscribeToken(userId);
    const res = await GET(new Request("http://localhost:3000/api/unsubscribe/x"), ctx(token));
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

  it("rejects an invalid token and leaves the flag unchanged", async () => {
    const userId = await seedTestUser({});
    const res = await GET(new Request("http://localhost:3000/api/unsubscribe/x"), ctx("garbage"));
    expect(res.status).toBe(400);

    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.emailOptIn).toBe(true);
  });

  it("is idempotent for an already-unsubscribed user", async () => {
    const userId = await seedTestUser({});
    await testDb.user.update({ where: { id: userId }, data: { emailOptIn: false } });
    const token = issueUnsubscribeToken(userId);
    const res = await GET(new Request("http://localhost:3000/api/unsubscribe/x"), ctx(token));
    expect(res.status).toBe(200);
    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.emailOptIn).toBe(false);
  });
});
