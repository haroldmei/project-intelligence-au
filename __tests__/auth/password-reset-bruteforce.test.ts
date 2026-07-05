// Issue #126: the password-reset confirm endpoint verified a 6-digit (10^6) OTP
// with no rate limiting and no failed-attempt lockout, so an attacker who knew a
// victim's email could brute-force the live code inside its 10-minute window and
// take over the account. Every sibling OTP path is throttled; this one was missed.
//
// This suite exercises the REAL rate-limit module (only db, otp, and crypto side
// effects are mocked) to prove the confirm route now caps guessing: a loop of
// wrong-token confirm requests for one email starts returning 429, and once
// capped the correct code can no longer be redeemed. Contrast the pre-fix
// behaviour, where every wrong guess returned 400 forever and the OTP stayed live.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, verifyAndConsumeOtpMock, hashPasswordMock, luciaMock } = vi.hoisted(
  () => ({
    mockDb: { user: { findUnique: vi.fn(), update: vi.fn() } },
    verifyAndConsumeOtpMock: vi.fn(),
    hashPasswordMock: vi.fn(),
    luciaMock: { invalidateUserSessions: vi.fn() },
  })
);

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth/otp", () => ({ verifyAndConsumeOtp: verifyAndConsumeOtpMock }));
vi.mock("@/lib/auth/passwords", () => ({ hashPassword: hashPasswordMock }));
vi.mock("@/lib/auth/lucia", () => ({ lucia: luciaMock }));
// NOTE: @/lib/auth/rate-limit is intentionally NOT mocked — we want the real
// fixed-window limiter so the 429 is produced by the code under test.

import { POST as confirmPOST } from "@/app/api/auth/password-reset/confirm/route";
import type { NextRequest } from "next/server";

const confirmUrl = "http://localhost:3000/api/auth/password-reset/confirm";

// Unique email per test — the real limiter keeps module-level state keyed by
// email, so reusing one across tests would leak the window between them.
function freshEmail(): string {
  const n = ++freshEmail.counter;
  return `victim-${n}@example.com`;
}
freshEmail.counter = 0;

// A distinct IP for every single request so the 5/min per-IP cap never masks the
// per-email cap we're asserting on; the per-email limiter is the account-level wall.
let ipSeq = 0;
function uniqueIp(): string {
  ipSeq += 1;
  return `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
}

function req(email: string, token: string): NextRequest {
  return new Request(confirmUrl, {
    method: "POST",
    headers: { "x-forwarded-for": uniqueIp() },
    body: JSON.stringify({ email, token, password: "correcthorsebattery" }),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.user.findUnique.mockResolvedValue({ id: "user-1", email: "victim@example.com" });
  hashPasswordMock.mockResolvedValue("new-hash");
  mockDb.user.update.mockResolvedValue({ id: "user-1" });
  luciaMock.invalidateUserSessions.mockResolvedValue(undefined);
});

describe("POST /api/auth/password-reset/confirm — brute-force protection (issue #126)", () => {
  it("starts returning 429 within >10 wrong-token guesses for one email", async () => {
    const email = freshEmail();
    verifyAndConsumeOtpMock.mockResolvedValue(false); // every guess is wrong

    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      // 6-digit wrong tokens, all different — mimics walking the code space.
      const token = String(100000 + i);
      const res = await confirmPOST(req(email, token));
      statuses.push(res.status);
    }

    // Unbounded guessing is no longer possible: a 429 appears well within the run.
    expect(statuses).toContain(429);
    // The cap bites at or before the 11th attempt (10/hr per email).
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("blocks redemption of the correct code once the email is capped", async () => {
    const email = freshEmail();
    verifyAndConsumeOtpMock.mockResolvedValue(false);

    // Burn the whole per-email budget with wrong guesses.
    for (let i = 0; i < 11; i++) {
      await confirmPOST(req(email, String(200000 + i)));
    }

    // Now the attacker (or even the real user) submits the CORRECT code — the
    // limiter short-circuits before verifyAndConsumeOtp, so it can't be redeemed.
    verifyAndConsumeOtpMock.mockResolvedValue(true);
    const res = await confirmPOST(req(email, "654321"));
    expect(res.status).toBe(429);
    // The OTP verify was never reached on the capped request, and no password
    // change / session invalidation happened.
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(luciaMock.invalidateUserSessions).not.toHaveBeenCalled();
  });

  it("the per-IP cap independently stops a single IP hammering many emails", async () => {
    verifyAndConsumeOtpMock.mockResolvedValue(false);
    const ip = "203.0.113.99";
    const statuses: number[] = [];
    // Same IP, a different fresh email each time so the per-email cap never fires
    // — only the 5/min per-IP cap can stop this.
    for (let i = 0; i < 8; i++) {
      const r = new Request(confirmUrl, {
        method: "POST",
        headers: { "x-forwarded-for": ip },
        body: JSON.stringify({
          email: freshEmail(),
          token: String(300000 + i),
          password: "correcthorsebattery",
        }),
      }) as unknown as NextRequest;
      statuses.push((await confirmPOST(r)).status);
    }
    expect(statuses).toContain(429);
    expect(statuses[5]).toBe(429); // 5/min per IP
  });
});
