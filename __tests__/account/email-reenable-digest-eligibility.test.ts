// Acceptance test for issue #105: email unsubscribe must not be a permanent
// dead-end. The full journey — receive digest → tap unsubscribe → open portal →
// re-enable → re-appear in the Sunday digest eligibility query — must round-trip.
//
// Before the fix, the ONLY write to emailOptIn anywhere in src/ was `false`
// (the token unsubscribe), so an unsubscribed paying subscriber was cut off
// from the paid deliverable for good while still being billed. This proves the
// authenticated re-enable path closes that loop.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import { issueUnsubscribeToken } from "@/lib/hmac/token";
import { POST as unsubscribePOST } from "@/app/api/unsubscribe/[token]/route";
import { emailOptIn } from "@/modules/account/service";
import { entitledDigestWhere } from "@/modules/billing/entitlement";

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
});

afterAll(async () => {
  await testDb.$disconnect();
});

// Mirrors the eligibility WHERE in src/modules/digest/cron.ts: an entitled,
// verified, still-opted-in user.
function digestEligible(userId: string) {
  return testDb.user.findFirst({
    where: {
      id: userId,
      emailVerified: true,
      emailOptIn: true,
      ...entitledDigestWhere(),
    },
    select: { id: true },
  });
}

describe("email unsubscribe → portal re-enable → digest eligibility (#105)", () => {
  it("re-includes a re-subscribed user in the Sunday digest query", async () => {
    const userId = await seedTestUser({});

    // 1. Baseline: an active, verified subscriber is eligible for the digest.
    expect(await digestEligible(userId)).not.toBeNull();

    // 2. They tap the one-click email unsubscribe link (POST, RFC-8058).
    const token = issueUnsubscribeToken(userId);
    const res = await unsubscribePOST(
      new Request("http://localhost:3000/api/unsubscribe/x", { method: "POST" }),
      { params: Promise.resolve({ token }) },
    );
    expect(res.status).toBe(200);

    // …and are now dropped from the eligibility query — the reported bug.
    expect(await digestEligible(userId)).toBeNull();

    // 3. From the portal they flip the email digest back on (the new control).
    const account = await emailOptIn(userId);
    expect(account.emailOptIn).toBe(true);

    // 4. The next cron run includes them again — the dead-end is gone.
    expect(await digestEligible(userId)).not.toBeNull();
  });
});
