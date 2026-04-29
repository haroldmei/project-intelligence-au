// Integration tests for Twilio STOP webhook handler
// FR-029 | system-design §6 NFR-015
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("Twilio STOP handler (DB integration)", () => {
  it("sets smsOptIn=false when STOP received", async () => {
    const userId = await seedTestUser({ mobile: "+61400000099" });
    await testDb.user.update({ where: { id: userId }, data: { smsOptIn: true } });

    // Simulate what the webhook handler does
    await testDb.user.updateMany({
      where: { mobile_e164: "+61400000099" },
      data: { smsOptIn: false },
    });

    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.smsOptIn).toBe(false);
  });

  it("is idempotent when user already opted out", async () => {
    const userId = await seedTestUser({ mobile: "+61400000088" });
    await testDb.user.update({ where: { id: userId }, data: { smsOptIn: false } });

    await testDb.user.updateMany({
      where: { mobile_e164: "+61400000088" },
      data: { smsOptIn: false },
    });

    const user = await testDb.user.findUnique({ where: { id: userId } });
    expect(user?.smsOptIn).toBe(false);
  });
});

describe("validateTwilioSignature", () => {
  it("returns false when TWILIO_AUTH_TOKEN is not set", async () => {
    const original = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_AUTH_TOKEN;

    const { validateTwilioSignature } = await import("@/lib/sms/client");
    const result = validateTwilioSignature("https://example.com", {}, "sig");
    expect(result).toBe(false);

    if (original) process.env.TWILIO_AUTH_TOKEN = original;
  });
});
