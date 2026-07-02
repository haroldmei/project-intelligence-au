// Integration tests for the real Twilio STOP webhook handler (issue #23).
// Spam Act 2003: inbound STOP flips smsOptIn=false immediately. Unlike the
// sibling twilio.test.ts (which simulates the DB write), this drives the actual
// route handler end-to-end.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import { POST } from "@/app/api/webhooks/twilio/route";

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
});

afterAll(async () => {
  await testDb.$disconnect();
});

function inbound(body: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/webhooks/twilio", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

describe("POST /api/webhooks/twilio — STOP handler", () => {
  it("flips smsOptIn=false immediately on STOP", async () => {
    const userId = await seedTestUser({ mobile: "+61400000077" });
    await testDb.user.update({ where: { id: userId }, data: { smsOptIn: true } });

    const res = await POST(inbound({ Body: "STOP", From: "+61400000077" }));
    expect(res.status).toBe(200);

    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.smsOptIn).toBe(false);
  });

  it("recognises the lowercase 'unsubscribe' keyword", async () => {
    const userId = await seedTestUser({ mobile: "+61400000078" });
    await testDb.user.update({ where: { id: userId }, data: { smsOptIn: true } });

    await POST(inbound({ Body: "unsubscribe", From: "+61400000078" }));

    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.smsOptIn).toBe(false);
  });

  it("ignores a non-STOP inbound message", async () => {
    const userId = await seedTestUser({ mobile: "+61400000079" });
    await testDb.user.update({ where: { id: userId }, data: { smsOptIn: true } });

    await POST(inbound({ Body: "hello there", From: "+61400000079" }));

    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.smsOptIn).toBe(true);
  });
});
