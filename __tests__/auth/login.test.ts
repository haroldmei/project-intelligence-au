// Issue #180: the login route mints a valid Lucia session but never signalled
// whether the account was verified, so the login page always routed to /digest —
// even for an unverified user the Sunday cron will never send to. The response
// now carries emailVerified so the client can send unverified users to /verify.
// Fully mocked (no DB) — the real LoginSchema drives validation.
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockDb,
  verifyPasswordMock,
  luciaMock,
  rateLimitMock,
  serializeCookieMock,
} = vi.hoisted(() => ({
  mockDb: { user: { findUnique: vi.fn() } },
  verifyPasswordMock: vi.fn(),
  luciaMock: { createSession: vi.fn(), createSessionCookie: vi.fn() },
  rateLimitMock: vi.fn(),
  serializeCookieMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth/passwords", () => ({ verifyPassword: verifyPasswordMock }));
vi.mock("@/lib/auth/lucia", () => ({ lucia: luciaMock }));
vi.mock("@/lib/auth/rate-limit", () => ({ rateLimitByIp: rateLimitMock }));
vi.mock("@/lib/auth/session", () => ({ serializeLuciaCookie: serializeCookieMock }));

import { POST } from "@/app/api/auth/login/route";
import type { NextRequest } from "next/server";

function req(body: unknown) {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validBody = { email: "Eli@example.com", password: "correcthorsebattery" };

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue({ allowed: true });
  verifyPasswordMock.mockResolvedValue(true);
  luciaMock.createSession.mockResolvedValue({ id: "sess-1" });
  luciaMock.createSessionCookie.mockReturnValue({ name: "session", value: "sess-1" });
  serializeCookieMock.mockReturnValue("session=sess-1");
});

describe("POST /api/auth/login — emailVerified in response (issue #180)", () => {
  it("returns emailVerified:false for an unverified account so the client routes to /verify", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "eli@example.com",
      passwordHash: "hash",
      emailVerified: false,
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ session_set: true, emailVerified: false });
  });

  it("returns emailVerified:true for a verified account", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "eli@example.com",
      passwordHash: "hash",
      emailVerified: true,
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.emailVerified).toBe(true);
  });

  it("still 401s on a bad password without leaking verification status", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "eli@example.com",
      passwordHash: "hash",
      emailVerified: false,
    });
    verifyPasswordMock.mockResolvedValue(false);
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).not.toHaveProperty("emailVerified");
  });
});
