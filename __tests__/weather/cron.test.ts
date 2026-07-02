// Integration tests for the storm-brief cron (#20).
// Feed fetch + email send are mocked (no live network); the DB dedupe (StormBrief
// unique constraint) and subscriber filtering are exercised against the real
// test Postgres. Covers the acceptance: a "Sydney Metropolitan" warning produces
// exactly one brief per affected user, no double-send, and a flag-off no-op.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { truncateAll, seedLgaBundles, seedTestUser, testDb } from "../setup-test-db";
import { sendEmail } from "@/lib/email/client";
import { fetchStormWarnings } from "@/modules/weather/feed";
import type { StormWarning } from "@/modules/weather/types";

vi.mock("@/lib/email/client", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock only the network fetch; keep isStormBriefEnabled real (reads process.env).
vi.mock("@/modules/weather/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/weather/feed")>();
  return { ...actual, fetchStormWarnings: vi.fn() };
});

const mockedSend = vi.mocked(sendEmail);
const mockedFetch = vi.mocked(fetchStormWarnings);

function sydneyMetroWarning(overrides: Partial<StormWarning> = {}): StormWarning {
  return {
    id: "IDN21031",
    type: "severe_thunderstorm",
    title: "Severe Thunderstorm Warning for Sydney Metropolitan",
    issuedAt: new Date("2026-01-15T04:35:00Z"),
    areas: ["Sydney Metropolitan"],
    url: "http://www.bom.gov.au/products/IDN21031.html",
    ...overrides,
  };
}

/** Create a verified, active subscriber wired to an LGA bundle. */
async function seedSubscriber(email: string, bundleId = "western_sydney"): Promise<string> {
  const userId = await seedTestUser({ email });
  await testDb.lgaBundleSubscription.create({ data: { userId, bundleId } });
  return userId;
}

beforeEach(async () => {
  await truncateAll();
  await seedLgaBundles();
  vi.clearAllMocks();
  mockedSend.mockResolvedValue(undefined);
  process.env.STORM_BRIEF_ENABLED = "true";
});

afterAll(async () => {
  delete process.env.STORM_BRIEF_ENABLED;
  await testDb.$disconnect();
});

describe("runStormBriefCron — flag off", () => {
  it("is a no-op: no feed fetch, no send, no rows", async () => {
    process.env.STORM_BRIEF_ENABLED = "false";
    await seedSubscriber("off@x.com");
    const { runStormBriefCron } = await import("@/modules/weather/cron");

    const result = await runStormBriefCron();

    expect(result.skipped).toBe(true);
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
    expect(await testDb.stormBrief.count()).toBe(0);
  });
});

describe("runStormBriefCron — flag on", () => {
  it("sends exactly one brief per affected user and records dedupe rows", async () => {
    mockedFetch.mockResolvedValue([sydneyMetroWarning()]);
    const u1 = await seedSubscriber("a@x.com");
    const u2 = await seedSubscriber("b@x.com");

    const { runStormBriefCron } = await import("@/modules/weather/cron");
    const result = await runStormBriefCron();

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockedSend).toHaveBeenCalledTimes(2);
    // one storm_briefs row per (warning, user)
    const rows = await testDb.stormBrief.findMany({ orderBy: { userId: "asc" } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([u1, u2]));
    expect(rows.every((r) => r.warningId === "IDN21031")).toBe(true);

    // the email uses the storm-brief template
    expect(mockedSend.mock.calls[0][0].template).toBe("storm-brief");
  });

  it("does not double-send when the same warning is still live on the next tick", async () => {
    mockedFetch.mockResolvedValue([sydneyMetroWarning()]);
    await seedSubscriber("a@x.com");
    const { runStormBriefCron } = await import("@/modules/weather/cron");

    const first = await runStormBriefCron();
    expect(first.sent).toBe(1);

    // Second tick — same warning id, still in the feed.
    const second = await runStormBriefCron();
    expect(second.sent).toBe(0);

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(await testDb.stormBrief.count()).toBe(1);
  });

  it("excludes users who opted out of storm briefs", async () => {
    mockedFetch.mockResolvedValue([sydneyMetroWarning()]);
    const optedOut = await seedSubscriber("out@x.com");
    await testDb.user.update({ where: { id: optedOut }, data: { stormBriefOptIn: false } });

    const { runStormBriefCron } = await import("@/modules/weather/cron");
    const result = await runStormBriefCron();

    expect(result.sent).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("excludes users who unsubscribed from all email (Spam Act opt-out)", async () => {
    mockedFetch.mockResolvedValue([sydneyMetroWarning()]);
    const unsub = await seedSubscriber("unsub@x.com");
    await testDb.user.update({ where: { id: unsub }, data: { emailOptIn: false } });

    const { runStormBriefCron } = await import("@/modules/weather/cron");
    const result = await runStormBriefCron();

    expect(result.sent).toBe(0);
  });

  it("sends nothing when the warning affects none of a user's LGAs", async () => {
    // Warning only for Penrith/Blacktown; subscriber is in inner_west bundle.
    mockedFetch.mockResolvedValue([
      sydneyMetroWarning({ id: "IDN21040", areas: ["near Penrith and Blacktown"] }),
    ]);
    await seedSubscriber("iw@x.com", "inner_west");

    const { runStormBriefCron } = await import("@/modules/weather/cron");
    const result = await runStormBriefCron();

    expect(result.sent).toBe(0);
    expect(await testDb.stormBrief.count()).toBe(0);
  });
});
