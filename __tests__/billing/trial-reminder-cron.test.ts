// Integration tests for GET /api/cron/trial-reminder (issue #128).
//
// The reminder must anchor on the REAL billing deadline (accessUntil = Stripe
// trial_end), NOT on account age (createdAt). The old day-26-of-account logic
// mis-fired for two cohorts:
//   (a) self-signup trials with no card (stripeCustomerId/accessUntil null) —
//       told a nonexistent card "will be charged AUD 99"; and
//   (b) subscribers who checked out days after signup — reminded while their
//       real Stripe trial still had (checkout-delay + 2) days left.
// email send is mocked; user selection + daysLeft run against the real test DB.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { truncateAll, testDb } from "../setup-test-db";
import { sendEmail } from "@/lib/email/client";
import { PRICING } from "@/lib/pricing";
import { GET } from "@/app/api/cron/trial-reminder/route";

vi.mock("@/lib/email/client", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

const mockedSend = vi.mocked(sendEmail);

const CRON_SECRET = process.env.CRON_SECRET!;
const MS_PER_DAY = 86_400_000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * MS_PER_DAY);
}

/** Create a trial user with full control over the billing anchor fields. */
async function seedTrialUser(opts: {
  email: string;
  createdAt: Date;
  accessUntil: Date | null;
  stripeCustomerId: string | null;
  emailOptIn?: boolean;
  trialReminderSentAt?: Date | null;
}): Promise<string> {
  const user = await testDb.user.create({
    data: {
      email: opts.email,
      passwordHash: "hashed",
      emailVerified: true,
      subscriptionStatus: "trial",
      createdAt: opts.createdAt,
      accessUntil: opts.accessUntil,
      stripeCustomerId: opts.stripeCustomerId,
      emailOptIn: opts.emailOptIn ?? true,
      trialReminderSentAt: opts.trialReminderSentAt ?? null,
    },
  });
  return user.id;
}

function invoke(secret = CRON_SECRET): Promise<Response> {
  return GET(
    new Request("http://localhost:3000/api/cron/trial-reminder", {
      headers: { authorization: `Bearer ${secret}` },
    }),
  ) as unknown as Promise<Response>;
}

/** Emails actually queued, keyed by recipient. */
function sentTo(email: string) {
  return mockedSend.mock.calls.map((c) => c[0]).find((p) => p.to === email);
}

beforeEach(async () => {
  await truncateAll();
  vi.clearAllMocks();
  mockedSend.mockResolvedValue(undefined);
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("GET /api/cron/trial-reminder — auth", () => {
  it("401s without a valid cron secret", async () => {
    const res = await invoke("wrong-secret");
    expect(res.status).toBe(401);
    expect(mockedSend).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/trial-reminder — anchors on accessUntil, not account age", () => {
  // Acceptance (1): a self-signup trial with no card is NEVER reminded, even
  // once its account is well past day 26 — there is nothing to charge.
  it("never reminds a self-signup trial with no card (accessUntil/stripeCustomerId null)", async () => {
    await seedTrialUser({
      email: "self-signup@example.com",
      createdAt: daysFromNow(-27), // well into the old day-26 window
      accessUntil: null,
      stripeCustomerId: null,
    });

    const res = await invoke();

    expect(await res.json()).toEqual({ reminded: 0 });
    expect(mockedSend).not.toHaveBeenCalled();
    // dedupe stamp untouched — we never attempted a send
    const u = await testDb.user.findFirstOrThrow({ where: { email: "self-signup@example.com" } });
    expect(u.trialReminderSentAt).toBeNull();
  });

  // Acceptance (2): a Stripe trialer is reminded when accessUntil is ~2 days
  // out, REGARDLESS of createdAt (here: checked out late, account is old).
  it("reminds a late-checkout Stripe trialer whose accessUntil is ~2 days out", async () => {
    await seedTrialUser({
      email: "late-checkout@example.com",
      createdAt: daysFromNow(-27), // old account...
      accessUntil: daysFromNow(2), // ...but real trial ends in 2 days
      stripeCustomerId: "cus_late",
    });

    const res = await invoke();

    expect(await res.json()).toEqual({ reminded: 1 });
    expect(sentTo("late-checkout@example.com")?.template).toBe("trial-reminder");
  });

  // The old bug: a late-checkout Stripe trialer whose real trial still has
  // plenty of runway must NOT be told "ends in 2 days" just because the
  // account is old.
  it("does NOT remind a Stripe trialer whose accessUntil is still far out", async () => {
    await seedTrialUser({
      email: "runway@example.com",
      createdAt: daysFromNow(-27), // old account (checked out late)
      accessUntil: daysFromNow(10), // real trial ends in 10 days
      stripeCustomerId: "cus_runway",
    });

    const res = await invoke();

    expect(await res.json()).toEqual({ reminded: 0 });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  // A brand-new account that happened to check out immediately IS in-window on
  // day 26 — proving the anchor is accessUntil, and this cohort still works.
  it("does not remind a Stripe trialer whose accessUntil already lapsed", async () => {
    await seedTrialUser({
      email: "lapsed@example.com",
      createdAt: daysFromNow(-30),
      accessUntil: daysFromNow(-1), // trial_end in the past
      stripeCustomerId: "cus_lapsed",
    });

    const res = await invoke();

    expect(await res.json()).toEqual({ reminded: 0 });
    expect(mockedSend).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/trial-reminder — daysLeft derives from accessUntil", () => {
  // Acceptance (3): daysLeft is computed from accessUntil, not a hardcoded 2 /
  // account age.
  it("passes daysLeft = 1 when the charge is ~1 day out", async () => {
    await seedTrialUser({
      email: "one-day@example.com",
      createdAt: daysFromNow(-5), // account age is irrelevant
      accessUntil: new Date(Date.now() + 0.5 * MS_PER_DAY), // 12h out → ceil = 1
      stripeCustomerId: "cus_one",
    });

    await invoke();

    expect(sentTo("one-day@example.com")?.props).toMatchObject({ daysLeft: 1 });
  });

  it("passes daysLeft = 2 when the charge is ~2 days out", async () => {
    await seedTrialUser({
      email: "two-day@example.com",
      createdAt: daysFromNow(-1),
      accessUntil: new Date(Date.now() + 1.5 * MS_PER_DAY), // 36h out → ceil = 2
      stripeCustomerId: "cus_two",
    });

    await invoke();

    expect(sentTo("two-day@example.com")?.props).toMatchObject({ daysLeft: 2 });
  });
});

describe("GET /api/cron/trial-reminder — dedupe + opt-out", () => {
  it("stamps trialReminderSentAt and does not re-send on the next tick", async () => {
    await seedTrialUser({
      email: "dedupe@example.com",
      createdAt: daysFromNow(-27),
      accessUntil: daysFromNow(2),
      stripeCustomerId: "cus_dedupe",
    });

    const first = await invoke();
    expect(await first.json()).toEqual({ reminded: 1 });
    const u = await testDb.user.findFirstOrThrow({ where: { email: "dedupe@example.com" } });
    expect(u.trialReminderSentAt).not.toBeNull();

    // accessUntil is still in-window on the next daily tick, but the stamp dedupes.
    const second = await invoke();
    expect(await second.json()).toEqual({ reminded: 0 });
    expect(mockedSend).toHaveBeenCalledTimes(1);
  });

  // Issue #127: the trial-ending reminder is transactional (the only pre-charge
  // warning), so it must reach a user who unsubscribed from the digest. A
  // marketing opt-out must NOT silently trigger a surprise auto-charge.
  it("still reminds a trialer who unsubscribed from email (transactional pre-charge notice)", async () => {
    await seedTrialUser({
      email: "unsub@example.com",
      createdAt: daysFromNow(-27),
      accessUntil: daysFromNow(2),
      stripeCustomerId: "cus_unsub",
      emailOptIn: false,
    });

    const res = await invoke();
    expect(await res.json()).toEqual({ reminded: 1 });
    expect(sentTo("unsub@example.com")?.template).toBe("trial-reminder");
    // dedupe stamp is set so the transactional notice is still sent at most once
    const u = await testDb.user.findFirstOrThrow({ where: { email: "unsub@example.com" } });
    expect(u.trialReminderSentAt).not.toBeNull();
  });

  it("never anchors daysLeft on PRICING.trialDays - 2 for a short custom trial", async () => {
    // A Stripe trial that is genuinely 1 day from charging must read "1 day",
    // never the account-age-derived PRICING.trialDays - 2.
    await seedTrialUser({
      email: "short@example.com",
      createdAt: daysFromNow(-2),
      accessUntil: new Date(Date.now() + 0.25 * MS_PER_DAY),
      stripeCustomerId: "cus_short",
    });

    await invoke();

    const props = sentTo("short@example.com")?.props as { daysLeft: number } | undefined;
    expect(props?.daysLeft).toBe(1);
    expect(props?.daysLeft).not.toBe(PRICING.trialDays - 2);
  });
});
