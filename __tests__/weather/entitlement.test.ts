// End-to-end proof that the issue #87 entitlement gate blocks a REAL cron send,
// not just a query. The storm-brief cron shares entitledDigestWhere with the
// digest cron, so an expired self-signup trial must receive NO storm brief.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { truncateAll, seedLgaBundles, testDb } from "../setup-test-db";
import { sendEmail } from "@/lib/email/client";
import { fetchStormWarnings } from "@/modules/weather/feed";
import { PRICING } from "@/lib/pricing";
import type { StormWarning } from "@/modules/weather/types";

vi.mock("@/lib/email/client", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/modules/weather/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/weather/feed")>();
  return { ...actual, fetchStormWarnings: vi.fn() };
});

const mockedSend = vi.mocked(sendEmail);
const mockedFetch = vi.mocked(fetchStormWarnings);
const DAY = 86_400_000;

function sydneyMetroWarning(): StormWarning {
  return {
    id: "IDN21031",
    type: "severe_thunderstorm",
    title: "Severe Thunderstorm Warning for Sydney Metropolitan",
    issuedAt: new Date("2026-01-15T04:35:00Z"),
    areas: ["Sydney Metropolitan"],
    url: "http://www.bom.gov.au/products/IDN21031.html",
  };
}

/** A verified trial subscriber wired to an LGA bundle, created N days ago. */
async function seedTrialSubscriber(email: string, createdAtDaysAgo: number): Promise<string> {
  const user = await testDb.user.create({
    data: {
      email,
      passwordHash: "hashed",
      mobile_e164: "+61400000002",
      trade: "roofing",
      emailVerified: true,
      emailOptIn: true,
      stormBriefOptIn: true,
      subscriptionStatus: "trial",
      accessUntil: null,
      stripeCustomerId: null,
      createdAt: new Date(Date.now() - createdAtDaysAgo * DAY),
    },
  });
  await testDb.lgaBundleSubscription.create({ data: { userId: user.id, bundleId: "western_sydney" } });
  return user.id;
}

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
  vi.clearAllMocks();
  mockedSend.mockResolvedValue(undefined);
  mockedFetch.mockResolvedValue([sydneyMetroWarning()]);
  process.env.STORM_BRIEF_ENABLED = "true";
});

afterAll(async () => {
  delete process.env.STORM_BRIEF_ENABLED;
  await testDb.$disconnect();
});

describe("runStormBriefCron — issue #87 expired-trial gate", () => {
  it("does NOT send a storm brief to an expired self-signup trial", async () => {
    await seedTrialSubscriber("expired@x.com", PRICING.trialDays + 30);

    const { runStormBriefCron } = await import("@/modules/weather/cron");
    const result = await runStormBriefCron();

    expect(result.sent).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
    expect(await testDb.stormBrief.count()).toBe(0);
  });

  it("still sends to a self-signup trial inside its window", async () => {
    await seedTrialSubscriber("fresh@x.com", 2);

    const { runStormBriefCron } = await import("@/modules/weather/cron");
    const result = await runStormBriefCron();

    expect(result.sent).toBe(1);
    expect(mockedSend).toHaveBeenCalledTimes(1);
  });
});
