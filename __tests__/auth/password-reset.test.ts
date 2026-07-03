// Issue #86: the forgot/reset pages POSTed to /api/auth/reset, which has no
// handler (404), so account recovery was dead end-to-end. The forms now hit
// /api/auth/password-reset/{request,confirm}. The confirm hop has no session,
// so it identifies the account by `email` (carried through the reset link) plus
// the OTP `token`. These tests pin both hops: the request link points back at
// the real /reset page carrying token+email, and confirm resolves the account
// by that email before consuming the OTP. Fully mocked (no DB).
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockDb,
  createOtpMock,
  verifyAndConsumeOtpMock,
  rateLimitMock,
  sendEmailMock,
  hashPasswordMock,
  luciaMock,
} = vi.hoisted(() => ({
  mockDb: { user: { findUnique: vi.fn(), update: vi.fn() } },
  createOtpMock: vi.fn(),
  verifyAndConsumeOtpMock: vi.fn(),
  rateLimitMock: vi.fn(),
  sendEmailMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  luciaMock: { invalidateUserSessions: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://app.example.com" } }));
vi.mock("@/lib/auth/otp", () => ({
  createOtp: createOtpMock,
  verifyAndConsumeOtp: verifyAndConsumeOtpMock,
}));
vi.mock("@/lib/auth/rate-limit", () => ({ rateLimitByIp: rateLimitMock }));
vi.mock("@/lib/email/client", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/auth/passwords", () => ({ hashPassword: hashPasswordMock }));
vi.mock("@/lib/auth/lucia", () => ({ lucia: luciaMock }));

import { POST as requestPOST } from "@/app/api/auth/password-reset/request/route";
import { POST as confirmPOST } from "@/app/api/auth/password-reset/confirm/route";
import type { NextRequest } from "next/server";

function req(url: string, body: unknown): NextRequest {
  return new Request(url, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const requestUrl = "http://localhost:3000/api/auth/password-reset/request";
const confirmUrl = "http://localhost:3000/api/auth/password-reset/confirm";

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue({ allowed: true });
});

describe("POST /api/auth/password-reset/request", () => {
  it("emails a reset link back to the real /reset page carrying token + email", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "user-1", email: "eli@example.com" });
    createOtpMock.mockResolvedValue("654321");
    sendEmailMock.mockResolvedValue(undefined);

    const res = await requestPOST(req(requestUrl, { email: "Eli@Example.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(createOtpMock).toHaveBeenCalledWith("user-1", "reset");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe("eli@example.com");
    expect(call.template).toBe("password-reset");
    // The link must target /reset (not the dead /auth/password-reset) and carry
    // both the OTP token and the account email so confirm can resolve the user.
    expect(call.props.resetUrl).toBe(
      "https://app.example.com/reset?token=654321&email=eli%40example.com"
    );
    expect(call.props.code).toBe("654321");
  });

  it("returns 200 without sending mail for an unknown email (no enumeration)", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);

    const res = await requestPOST(req(requestUrl, { email: "ghost@example.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(createOtpMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/password-reset/confirm", () => {
  const validBody = {
    token: "654321",
    email: "eli@example.com",
    password: "correcthorsebattery",
  };

  it("resolves the account by email, consumes the OTP, and resets the password", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "user-1", email: "eli@example.com" });
    verifyAndConsumeOtpMock.mockResolvedValue(true);
    hashPasswordMock.mockResolvedValue("new-hash");
    mockDb.user.update.mockResolvedValue({ id: "user-1" });
    luciaMock.invalidateUserSessions.mockResolvedValue(undefined);

    const res = await confirmPOST(req(confirmUrl, { ...validBody, email: "Eli@Example.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    // email is normalised before the lookup
    expect(mockDb.user.findUnique).toHaveBeenCalledWith({ where: { email: "eli@example.com" } });
    expect(verifyAndConsumeOtpMock).toHaveBeenCalledWith("user-1", "654321", "reset");
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "new-hash" },
    });
    // all existing sessions are killed so a stolen session can't outlive a reset
    expect(luciaMock.invalidateUserSessions).toHaveBeenCalledWith("user-1");
  });

  it("rejects a body with no email (422) — the account can't be resolved", async () => {
    const res = await confirmPOST(req(confirmUrl, { token: "654321", password: "correcthorsebattery" }));
    expect(res.status).toBe(422);
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown account without touching the OTP store", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    const res = await confirmPOST(req(confirmUrl, validBody));
    expect(res.status).toBe(400);
    expect(verifyAndConsumeOtpMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the OTP is wrong or expired, leaving the password unchanged", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "user-1", email: "eli@example.com" });
    verifyAndConsumeOtpMock.mockResolvedValue(false);
    const res = await confirmPOST(req(confirmUrl, validBody));
    expect(res.status).toBe(400);
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(luciaMock.invalidateUserSessions).not.toHaveBeenCalled();
  });
});
