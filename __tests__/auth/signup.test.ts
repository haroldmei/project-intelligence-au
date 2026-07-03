// Issue #89: the landing page sells "Email + SMS" and signup requires an AU
// mobile, but the signup route never set smsOptIn, so every new tradie was
// silently opted OUT of the SMS channel they were sold (spec SF-3.4 / UX §7.9
// mandate default ON). These tests pin that a new account is opted IN at
// creation. Fully mocked (no DB) — the real SignupSchema drives validation.
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockDb,
  hashPasswordMock,
  luciaMock,
  createOtpMock,
  rateLimitMock,
  serializeCookieMock,
  sendEmailMock,
  captureServerMock,
} = vi.hoisted(() => ({
  mockDb: { user: { findUnique: vi.fn(), create: vi.fn() } },
  hashPasswordMock: vi.fn(),
  luciaMock: { createSession: vi.fn(), createSessionCookie: vi.fn() },
  createOtpMock: vi.fn(),
  rateLimitMock: vi.fn(),
  serializeCookieMock: vi.fn(),
  sendEmailMock: vi.fn(),
  captureServerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_live_placeholder" } }));
vi.mock("@/lib/auth/passwords", () => ({ hashPassword: hashPasswordMock }));
vi.mock("@/lib/auth/lucia", () => ({ lucia: luciaMock }));
vi.mock("@/lib/auth/otp", () => ({ createOtp: createOtpMock }));
vi.mock("@/lib/auth/rate-limit", () => ({ rateLimitByIp: rateLimitMock }));
vi.mock("@/lib/auth/session", () => ({ serializeLuciaCookie: serializeCookieMock }));
vi.mock("@/lib/email/client", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/analytics/server", () => ({ captureServer: captureServerMock }));

import { POST } from "@/app/api/auth/signup/route";
import type { NextRequest } from "next/server";

function req(body: unknown) {
  return new Request("http://localhost:3000/api/auth/signup", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validBody = {
  email: "New.Tradie@example.com",
  password: "correcthorsebattery",
  mobile_e164: "412345678",
  acceptTerms: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue({ allowed: true });
  mockDb.user.findUnique.mockResolvedValue(null); // email is free
  mockDb.user.create.mockResolvedValue({ id: "user-1", email: "new.tradie@example.com" });
  hashPasswordMock.mockResolvedValue("hashed");
  luciaMock.createSession.mockResolvedValue({ id: "sess-1" });
  luciaMock.createSessionCookie.mockReturnValue({ name: "session", value: "sess-1" });
  serializeCookieMock.mockReturnValue("session=sess-1");
  createOtpMock.mockResolvedValue("123456");
  sendEmailMock.mockResolvedValue(undefined);
});

describe("POST /api/auth/signup", () => {
  it("opts the new account INTO SMS at creation (issue #89, SF-3.4)", async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(201);
    expect(mockDb.user.create).toHaveBeenCalledTimes(1);
    const data = mockDb.user.create.mock.calls[0][0].data;
    expect(data.smsOptIn).toBe(true);
    // Sanity: the mobile the SMS goes to was actually collected + normalised.
    expect(data.mobile_e164).toBe("+61412345678");
  });

  it("rejects an invalid body without creating a user", async () => {
    const res = await POST(req({ ...validBody, mobile_e164: "not-a-mobile" }));
    expect(res.status).toBe(422);
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });
});
