// Issue #200: a single shared OTP_EXPIRY_MINUTES constant capped every purpose
// at 10 min, so password-reset links died well inside the 1-hour window FR-017
// promises. createOtp now derives the expiry from the purpose: 60 min for
// 'reset' (FR-017 / design §6.1) and 15 min for 'verify' (FR-016).
//
// argon2 is mocked so hashing is deterministic and fast; db is mocked so we can
// assert the exact expiresAt persisted and simulate the live-window lookup.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockDb, argonHashMock, argonVerifyMock } = vi.hoisted(() => ({
  mockDb: {
    emailOtp: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  argonHashMock: vi.fn(),
  argonVerifyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("argon2", () => ({
  default: { hash: argonHashMock, verify: argonVerifyMock, argon2id: 2 },
}));

import { createOtp, verifyAndConsumeOtp } from "@/lib/auth/otp";

const ISSUED_AT = new Date("2026-01-01T00:00:00.000Z");
const MINUTE = 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(ISSUED_AT);
  argonHashMock.mockResolvedValue("hashed");
  mockDb.emailOtp.create.mockResolvedValue({});
  mockDb.emailOtp.updateMany.mockResolvedValue({});
  mockDb.emailOtp.update.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

/** expiresAt handed to the last emailOtp.create call. */
function createdExpiresAt(): Date {
  return mockDb.emailOtp.create.mock.calls[0][0].data.expiresAt;
}

describe("createOtp — per-purpose expiry", () => {
  it("issues a reset OTP that expires 60 minutes after issuance (FR-017)", async () => {
    await createOtp("user-1", "reset");
    expect(createdExpiresAt().getTime()).toBe(ISSUED_AT.getTime() + 60 * MINUTE);
  });

  it("issues a verify OTP that expires 15 minutes after issuance (FR-016)", async () => {
    await createOtp("user-1", "verify");
    expect(createdExpiresAt().getTime()).toBe(ISSUED_AT.getTime() + 15 * MINUTE);
  });

  it("does not over-extend the short-lived login OTP", async () => {
    await createOtp("user-1", "login");
    expect(createdExpiresAt().getTime()).toBe(ISSUED_AT.getTime() + 10 * MINUTE);
  });
});

describe("password-reset window end-to-end (FR-017)", () => {
  // findFirst honours the same `expiresAt: { gt: now }` live-window filter the
  // real Prisma query applies, so consumption reflects the persisted expiry.
  function wireLiveWindow() {
    let stored: Record<string, unknown> | null = null;
    mockDb.emailOtp.create.mockImplementation(async ({ data }) => {
      stored = { id: "otp-1", attemptCount: 0, consumedAt: null, ...data };
      return stored;
    });
    mockDb.emailOtp.findFirst.mockImplementation(async ({ where }) => {
      if (!stored || stored.consumedAt) return null;
      const gt = where.expiresAt?.gt as Date | undefined;
      if (gt && (stored.expiresAt as Date) <= gt) return null;
      return stored;
    });
  }

  it("accepts a reset code submitted 59 minutes after issuance", async () => {
    wireLiveWindow();
    argonVerifyMock.mockResolvedValue(true);

    await createOtp("user-1", "reset");
    vi.setSystemTime(new Date(ISSUED_AT.getTime() + 59 * MINUTE));

    expect(await verifyAndConsumeOtp("user-1", "654321", "reset")).toBe(true);
  });

  it("rejects a reset code submitted 61 minutes after issuance", async () => {
    wireLiveWindow();
    argonVerifyMock.mockResolvedValue(true);

    await createOtp("user-1", "reset");
    vi.setSystemTime(new Date(ISSUED_AT.getTime() + 61 * MINUTE));

    expect(await verifyAndConsumeOtp("user-1", "654321", "reset")).toBe(false);
    // Expired before argon2 ran — the live-window filter dropped the row.
    expect(argonVerifyMock).not.toHaveBeenCalled();
  });
});
