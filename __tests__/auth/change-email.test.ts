// Issue #92: a tradie who fat-fingers their signup email lands on /verify with
// the OTP going to the wrong inbox and, previously, no way to fix it. This route
// lets a signed-in but unverified user correct the pending email and re-sends a
// fresh OTP to the corrected address. Fully mocked (no DB).
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockDb,
  validateRequestMock,
  createOtpMock,
  rateLimitMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  mockDb: { user: { findUnique: vi.fn(), update: vi.fn() } },
  validateRequestMock: vi.fn(),
  createOtpMock: vi.fn(),
  rateLimitMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth/session", () => ({ validateRequest: validateRequestMock }));
vi.mock("@/lib/auth/otp", () => ({ createOtp: createOtpMock }));
vi.mock("@/lib/auth/rate-limit", () => ({ rateLimitChangeEmailByAccount: rateLimitMock }));
vi.mock("@/lib/email/client", () => ({ sendEmail: sendEmailMock }));

import { POST } from "@/app/api/auth/verify-email/change-email/route";
import type { NextRequest } from "next/server";

function req(body: unknown) {
  return new Request("http://localhost:3000/api/auth/verify-email/change-email", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue({
    session: { id: "sess-1" },
    user: { id: "user-1", email: "eil@exmaple.com", emailVerified: false },
  });
  rateLimitMock.mockReturnValue({ allowed: true });
  mockDb.user.findUnique.mockResolvedValue(null); // corrected address is free
  mockDb.user.update.mockResolvedValue({ id: "user-1" });
  createOtpMock.mockResolvedValue("654321");
  sendEmailMock.mockResolvedValue(undefined);
});

describe("POST /api/auth/verify-email/change-email", () => {
  it("updates the pending email and re-sends the OTP to the corrected address", async () => {
    const res = await POST(req({ email: "Eli@Example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "eli@example.com", sent: true });

    // Persisted normalised (lower-cased) email.
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { email: "eli@example.com" },
    });
    // Fresh OTP dispatched to the corrected inbox.
    expect(createOtpMock).toHaveBeenCalledWith("user-1", "verify");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const arg = sendEmailMock.mock.calls[0][0];
    expect(arg.to).toBe("eli@example.com");
    expect(arg.template).toBe("verify-email");
    expect(arg.props).toEqual({ email: "eli@example.com", code: "654321" });
  });

  it("401s when there is no session", async () => {
    validateRequestMock.mockResolvedValue(null);
    const res = await POST(req({ email: "eli@example.com" }));
    expect(res.status).toBe(401);
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("400s when the email is already verified (wrong flow)", async () => {
    validateRequestMock.mockResolvedValue({
      session: { id: "sess-1" },
      user: { id: "user-1", email: "eli@example.com", emailVerified: true },
    });
    const res = await POST(req({ email: "new@example.com" }));
    expect(res.status).toBe(400);
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("429s when rate limited without touching the DB or sending mail", async () => {
    rateLimitMock.mockReturnValue({ allowed: false, retryAfterSeconds: 900 });
    const res = await POST(req({ email: "eli@example.com" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("900");
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("422s on an invalid email", async () => {
    const res = await POST(req({ email: "not-an-email" }));
    expect(res.status).toBe(422);
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("409s when another account already owns the address", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "someone-else" });
    const res = await POST(req({ email: "taken@example.com" }));
    expect(res.status).toBe(409);
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("allows re-sending to the user's own current address (findUnique returns self)", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "user-1" });
    const res = await POST(req({ email: "eil@exmaple.com" }));
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("400s on a malformed JSON body", async () => {
    const res = await POST(req("{not json"));
    expect(res.status).toBe(400);
  });
});
