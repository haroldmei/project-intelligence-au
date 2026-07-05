// Issue #126: verifyAndConsumeOtp used to return false on a wrong code WITHOUT
// consuming the OTP or counting the attempt — so a single live 6-digit code
// could be hammered indefinitely within its window. It now increments a per-OTP
// failed-guess counter and burns the code once the ceiling (5) is reached, so
// one code can't be brute-forced even if a rate-limit window rolls over.
//
// argon2 is mocked so verify() outcomes are deterministic and fast; db is mocked
// so we can assert the exact writes.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, argonVerifyMock, argonHashMock } = vi.hoisted(() => ({
  mockDb: {
    emailOtp: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  },
  argonVerifyMock: vi.fn(),
  argonHashMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("argon2", () => ({
  default: {
    verify: argonVerifyMock,
    hash: argonHashMock,
    argon2id: 2,
  },
}));

import { verifyAndConsumeOtp } from "@/lib/auth/otp";

const liveOtp = (over: Record<string, unknown> = {}) => ({
  id: "otp-1",
  userId: "user-1",
  codeHash: "hash",
  purpose: "reset",
  consumedAt: null,
  attemptCount: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.emailOtp.update.mockResolvedValue({});
});

describe("verifyAndConsumeOtp — failed-attempt lockout (issue #126)", () => {
  it("returns true and consumes the OTP on a correct code", async () => {
    mockDb.emailOtp.findFirst.mockResolvedValue(liveOtp());
    argonVerifyMock.mockResolvedValue(true);

    const ok = await verifyAndConsumeOtp("user-1", "654321", "reset");
    expect(ok).toBe(true);
    expect(mockDb.emailOtp.update).toHaveBeenCalledWith({
      where: { id: "otp-1" },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("returns false and increments the counter (without consuming) on an early wrong code", async () => {
    mockDb.emailOtp.findFirst.mockResolvedValue(liveOtp({ attemptCount: 0 }));
    argonVerifyMock.mockResolvedValue(false);

    const ok = await verifyAndConsumeOtp("user-1", "000000", "reset");
    expect(ok).toBe(false);
    // Counter bumped to 1; OTP stays live (no consumedAt written).
    expect(mockDb.emailOtp.update).toHaveBeenCalledWith({
      where: { id: "otp-1" },
      data: { attemptCount: 1 },
    });
  });

  it("burns the OTP when the wrong code hits the attempt ceiling", async () => {
    // 4 prior failures already recorded; this 5th wrong guess should consume it.
    mockDb.emailOtp.findFirst.mockResolvedValue(liveOtp({ attemptCount: 4 }));
    argonVerifyMock.mockResolvedValue(false);

    const ok = await verifyAndConsumeOtp("user-1", "000000", "reset");
    expect(ok).toBe(false);
    expect(mockDb.emailOtp.update).toHaveBeenCalledWith({
      where: { id: "otp-1" },
      data: { attemptCount: 5, consumedAt: expect.any(Date) },
    });
  });

  it("finds no live OTP once it has been burned — a later correct guess can't redeem it", async () => {
    // After the 5th failure the row is consumed; the next lookup (consumedAt: null
    // filter) returns nothing, so even the real code is rejected.
    mockDb.emailOtp.findFirst.mockResolvedValue(null);

    const ok = await verifyAndConsumeOtp("user-1", "654321", "reset");
    expect(ok).toBe(false);
    expect(argonVerifyMock).not.toHaveBeenCalled();
    expect(mockDb.emailOtp.update).not.toHaveBeenCalled();
  });
});
