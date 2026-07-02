// Integration tests for POST /api/waitlist (issue #25).
// Unauthenticated demand-capture: validation, idempotent dedupe, honeypot, rate limit.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, testDb } from "../setup-test-db";
import { POST } from "@/app/api/waitlist/route";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testDb.$disconnect();
});

// Each test uses a distinct IP so the in-memory 5/min/IP limiter doesn't bleed
// across tests (the limiter is a process-global Map keyed by ip:route).
function post(body: unknown, ip = "203.0.113.1"): Promise<Response> {
  return POST(
    new Request("http://localhost:3000/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }) as never
  );
}

const valid = { email: "mel-roofer@example.com", trade: "roofing", region: "Melbourne" };

describe("POST /api/waitlist", () => {
  it("stores a valid submission and returns 201", async () => {
    const res = await post(valid, "203.0.113.10");
    expect(res.status).toBe(201);

    const rows = await testDb.waitlistEntry.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "mel-roofer@example.com",
      trade: "roofing",
      region: "melbourne", // lowercased
      source: "landing",
      note: null,
    });
  });

  it("is idempotent — repeat submissions do not create duplicate rows", async () => {
    await post(valid, "203.0.113.11");
    await post(valid, "203.0.113.11");
    const rows = await testDb.waitlistEntry.findMany();
    expect(rows).toHaveLength(1);
  });

  it("dedupes case-insensitively on email/trade/region", async () => {
    await post({ email: "Bob@Example.com", trade: "Plumbing", region: "Perth" }, "203.0.113.12");
    await post({ email: "bob@example.com", trade: "plumbing", region: "perth" }, "203.0.113.12");
    const rows = await testDb.waitlistEntry.findMany();
    expect(rows).toHaveLength(1);
  });

  it("treats a different (trade, region) for the same email as a new row", async () => {
    await post({ email: "multi@example.com", trade: "roofing", region: "Melbourne" }, "203.0.113.13");
    await post({ email: "multi@example.com", trade: "tiling", region: "Melbourne" }, "203.0.113.13");
    const rows = await testDb.waitlistEntry.findMany();
    expect(rows).toHaveLength(2);
  });

  it("rejects an invalid email with 422", async () => {
    const res = await post({ email: "not-an-email", trade: "roofing", region: "Perth" }, "203.0.113.14");
    expect(res.status).toBe(422);
    expect(await testDb.waitlistEntry.count()).toBe(0);
  });

  it("rejects a missing region with 422", async () => {
    const res = await post({ email: "a@b.com", trade: "roofing" }, "203.0.113.15");
    expect(res.status).toBe(422);
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.16" },
        body: "{ not json",
      }) as never
    );
    expect(res.status).toBe(400);
  });

  it("silently drops a honeypot-tripped submission (201, no row)", async () => {
    const res = await post({ ...valid, company: "SpamCorp" }, "203.0.113.17");
    expect(res.status).toBe(201);
    expect(await testDb.waitlistEntry.count()).toBe(0);
  });

  it("persists an optional note and signup source", async () => {
    await post(
      { email: "note@example.com", trade: "electrical", region: "Brisbane", note: "3 crews", source: "signup" },
      "203.0.113.18"
    );
    const row = await testDb.waitlistEntry.findFirst({ where: { email: "note@example.com" } });
    expect(row?.note).toBe("3 crews");
    expect(row?.source).toBe("signup");
  });

  it("rate limits after 5 requests from the same IP (429 + Retry-After)", async () => {
    const ip = "203.0.113.99";
    for (let i = 0; i < 5; i++) {
      const ok = await post({ email: `rl-${i}@example.com`, trade: "roofing", region: "Perth" }, ip);
      expect(ok.status).toBe(201);
    }
    const limited = await post({ email: "rl-6@example.com", trade: "roofing", region: "Perth" }, ip);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });
});
