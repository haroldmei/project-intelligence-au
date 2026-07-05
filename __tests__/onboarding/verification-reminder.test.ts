// FR-016 verification reminder (issue #130). The digest cron gates on
// emailVerified:true, so an unverified signup silently gets no digest and,
// before this cron, no nudge. These tests assert the reminder fires exactly
// once per unverified account on the Thursday before its first Sunday digest,
// never to verified accounts, and never twice (dedupe).
//
// Fully mocked (no DB): the mocks stand in for the user rows and the send
// client so we can assert exactly who is emailed and how the dedupe stamp is
// written.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, sendEmailMock } = vi.hoisted(() => ({
  mockDb: {
    user: { findMany: vi.fn(), update: vi.fn() },
  },
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/email/client", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/hmac/token", () => ({ issueUnsubscribeToken: () => "tok" }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://app.test" } }));

import {
  runVerificationReminderCron,
  verificationReminderCutoff,
} from "@/modules/onboarding/verification-reminder";

beforeEach(() => {
  vi.clearAllMocks();
  sendEmailMock.mockResolvedValue(undefined);
  mockDb.user.update.mockResolvedValue({});
});

describe("verificationReminderCutoff", () => {
  it("returns the Thursday 00:00 UTC before the first Sunday digest", () => {
    // Monday 2026-07-06 → first Sunday digest 2026-07-12 07:00 UTC →
    // Thursday before = 2026-07-09 00:00 UTC.
    const cutoff = verificationReminderCutoff(new Date("2026-07-06T10:00:00Z"));
    expect(cutoff.toISOString()).toBe("2026-07-09T00:00:00.000Z");
    expect(cutoff.getUTCDay()).toBe(4); // Thursday
  });

  it("uses this week's Sunday when signup is before Sunday 07:00 UTC", () => {
    // Sunday 2026-07-12 06:00 UTC is before that day's 07:00 digest, so the
    // first digest is the SAME Sunday → Thursday before = 2026-07-09.
    const cutoff = verificationReminderCutoff(new Date("2026-07-12T06:00:00Z"));
    expect(cutoff.toISOString()).toBe("2026-07-09T00:00:00.000Z");
  });

  it("rolls to next Sunday when signup is after Sunday 07:00 UTC", () => {
    // Sunday 2026-07-12 08:00 UTC has missed that day's digest → first digest
    // is 2026-07-19 → Thursday before = 2026-07-16.
    const cutoff = verificationReminderCutoff(new Date("2026-07-12T08:00:00Z"));
    expect(cutoff.toISOString()).toBe("2026-07-16T00:00:00.000Z");
  });
});

const MONDAY = new Date("2026-07-06T10:00:00Z");
const THURSDAY = new Date("2026-07-09T05:00:00Z"); // a cron tick on the cutoff day
const WEDNESDAY = new Date("2026-07-08T05:00:00Z"); // before the cutoff

function unverified(id: string, createdAt: Date) {
  return { id, email: `${id}@example.com`, createdAt };
}

describe("runVerificationReminderCron", () => {
  it("sends exactly one reminder on the Thursday cutoff and stamps dedupe", async () => {
    mockDb.user.findMany.mockResolvedValue([unverified("u1", MONDAY)]);

    const result = await runVerificationReminderCron(THURSDAY);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "u1@example.com",
        template: "verification-reminder",
      }),
    );
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { verificationReminderSentAt: THURSDAY },
    });
    expect(result).toEqual({ candidates: 1, reminded: 1 });
  });

  it("does not send before the account's Thursday cutoff", async () => {
    mockDb.user.findMany.mockResolvedValue([unverified("u1", MONDAY)]);

    const result = await runVerificationReminderCron(WEDNESDAY);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(result).toEqual({ candidates: 1, reminded: 0 });
  });

  it("dedupes: already-reminded accounts are excluded by the query filter", async () => {
    // The verificationReminderSentAt:null predicate lives in the query, so a
    // reminded account never comes back — assert that filter is requested.
    mockDb.user.findMany.mockResolvedValue([]);

    await runVerificationReminderCron(THURSDAY);

    expect(mockDb.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailVerified: false,
          emailOptIn: true,
          verificationReminderSentAt: null,
        }),
      }),
    );
  });

  it("stamps each account before moving on, so a mid-loop crash can't re-send", async () => {
    mockDb.user.findMany.mockResolvedValue([
      unverified("u1", MONDAY),
      unverified("u2", MONDAY),
    ]);
    // u2's send throws — u1 must already be stamped, and the loop must survive.
    sendEmailMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("resend down"));

    const result = await runVerificationReminderCron(THURSDAY);

    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { verificationReminderSentAt: THURSDAY },
    });
    // u2 failed before its stamp, so it stays eligible for the next tick.
    expect(mockDb.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u2" } }),
    );
    expect(result).toEqual({ candidates: 2, reminded: 1 });
  });
});
