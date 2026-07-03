// Issue #96 A2: the welcome-after-verify template was registered but never
// dispatched. The verify-email success path must now send it — best-effort, so
// a mail failure never turns a successful verification into an error response.
// Fully mocked (no DB): asserts the dispatch happens with the right props and
// that a send failure is swallowed.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, validateRequestMock, verifyOtpMock, rateLimitMock, captureMock, sendEmailMock } =
  vi.hoisted(() => ({
    mockDb: { user: { update: vi.fn() } },
    validateRequestMock: vi.fn(),
    verifyOtpMock: vi.fn(),
    rateLimitMock: vi.fn(),
    captureMock: vi.fn(),
    sendEmailMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth/session", () => ({ validateRequest: validateRequestMock }));
vi.mock("@/lib/auth/otp", () => ({ verifyAndConsumeOtp: verifyOtpMock }));
vi.mock("@/lib/auth/rate-limit", () => ({ rateLimitOtpVerifyByUser: rateLimitMock }));
vi.mock("@/lib/analytics/server", () => ({ captureServer: captureMock }));
vi.mock("@/lib/email/client", () => ({ sendEmail: sendEmailMock }));

import { POST } from "@/app/api/auth/verify-email/route";
import type { NextRequest } from "next/server";

function req(body: unknown) {
  return new Request("http://localhost:3000/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue({
    session: { id: "sess-1" },
    user: { id: "user-1", email: "jane.smith@example.com" },
  });
  rateLimitMock.mockReturnValue({ allowed: true });
  verifyOtpMock.mockResolvedValue(true);
  mockDb.user.update.mockResolvedValue({ id: "user-1" });
  sendEmailMock.mockResolvedValue(undefined);
});

describe("POST /api/auth/verify-email — welcome dispatch (A2)", () => {
  it("sends welcome-after-verify with a name derived from the email and the onboarding URL", async () => {
    const res = await POST(req({ code: "123456" }));
    expect(res.status).toBe(200);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const arg = sendEmailMock.mock.calls[0][0];
    expect(arg.to).toBe("jane.smith@example.com");
    expect(arg.template).toBe("welcome-after-verify");
    expect(arg.props.firstName).toBe("Jane"); // local-part before the dot, capitalised
    expect(arg.props.lgaSetupUrl).toMatch(/\/onboarding\/area$/);
  });

  it("still returns 200 when the welcome email fails (best-effort)", async () => {
    sendEmailMock.mockRejectedValue(new Error("resend 500"));
    const res = await POST(req({ code: "123456" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: true });
  });

  it("does not send a welcome email when the OTP is invalid", async () => {
    verifyOtpMock.mockResolvedValue(false);
    const res = await POST(req({ code: "000000" }));
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
