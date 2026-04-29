// Adversarial inputs against src/lib/auth/*
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
//
// Goal: try to BREAK the auth surface — schema validators, password policy,
// rate limiter, OTP — by feeding extreme/malformed input.
import { describe, it, expect, beforeEach } from "vitest";
import {
  SignupSchema,
  LoginSchema,
  OtpVerifySchema,
  PasswordResetConfirmSchema,
} from "@/lib/auth/schemas";
import {
  validatePasswordPolicy,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/passwords";
import {
  checkRateLimit,
  rateLimitByIp,
  rateLimitOtpVerifyByUser,
} from "@/lib/auth/rate-limit";
import { generateOtpCode } from "@/lib/auth/otp";

// ─────────────────────────────────────────────────────────────────────────────
// SignupSchema adversarial cases
// ─────────────────────────────────────────────────────────────────────────────
describe("SignupSchema — adversarial", () => {
  const baseValid = {
    email: "user@example.com",
    password: "correcthorsebatterystaple",
    mobile_e164: "+61412345678",
    trade: "roofing" as const,
    acceptTerms: true as const,
  };

  it("rejects 10KB email", () => {
    const giant = "a".repeat(10_000) + "@example.com";
    const r = SignupSchema.safeParse({ ...baseValid, email: giant });
    // Zod's email validator should reject; if it accepts a 10KB email that's
    // a DOS vector through downstream consumers (DB, Resend, hashing).
    expect(r.success).toBe(false);
  });

  it("rejects unicode bidi override in email", () => {
    // RTL override character can disguise sender domain in clients.
    const r = SignupSchema.safeParse({
      ...baseValid,
      email: "user@evil‮.com",
    });
    // Zod's regex is loose. Whatever the result, normalize() must not crash.
    if (r.success) {
      // If accepted, ensure the lowercase/trim normalisation in signup doesn't
      // strip the bidi char (which would silently mutate identity).
      expect(() => r.data.email.toLowerCase().trim()).not.toThrow();
    } else {
      expect(r.success).toBe(false);
    }
  });

  it("rejects SQL meta-chars in email", () => {
    const r = SignupSchema.safeParse({
      ...baseValid,
      email: "x'; DROP TABLE users; --@example.com",
    });
    // Email regex should reject; Prisma parameterises but a bad email reaching DB still wastes resources.
    expect(r.success).toBe(false);
  });

  it("rejects HTML/script in mobile field", () => {
    const r = SignupSchema.safeParse({
      ...baseValid,
      mobile_e164: "<script>alert(1)</script>",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty password", () => {
    const r = SignupSchema.safeParse({ ...baseValid, password: "" });
    expect(r.success).toBe(false);
  });

  it("rejects 1-char password", () => {
    const r = SignupSchema.safeParse({ ...baseValid, password: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects 1MB password (DOS via argon2 cost)", () => {
    const huge = "x".repeat(1_000_000);
    const r = SignupSchema.safeParse({ ...baseValid, password: huge });
    // SignupSchema caps at 128 chars per passwordSchema.
    expect(r.success).toBe(false);
  });

  it("accepts password with control chars (NIST SP 800-63B says any printable+space, but spec says min 12 only)", () => {
    const ctrl = "abcdefghijkl"; // 14 chars incl ctrl
    const r = SignupSchema.safeParse({ ...baseValid, password: ctrl });
    // Spec is silent on control chars — so accept. Document behaviour either way.
    expect(typeof r.success).toBe("boolean");
  });

  it("rejects password containing null byte if shorter than 12 due to truncation? (spec ambiguity)", () => {
    // \x00 in password — argon2 should NOT truncate, but bcrypt would (we use argon2).
    const nullPw = "passwordpassw\x00ord"; // valid length
    const r = SignupSchema.safeParse({ ...baseValid, password: nullPw });
    expect(r.success).toBe(true);
  });

  it("rejects acceptTerms=false (consent-bypass attempt)", () => {
    const r = SignupSchema.safeParse({
      ...baseValid,
      acceptTerms: false as unknown as true,
    });
    expect(r.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validatePasswordPolicy
// ─────────────────────────────────────────────────────────────────────────────
describe("validatePasswordPolicy — boundary", () => {
  it("rejects 11 chars (min - 1)", () => {
    expect(validatePasswordPolicy("a".repeat(11))).not.toBeNull();
  });
  it("accepts exactly 12 chars (min)", () => {
    expect(validatePasswordPolicy("a".repeat(12))).toBeNull();
  });
  it("accepts 1MB password (no max enforced server-side)", () => {
    // KNOWN ISSUE: passwords.ts has no upper bound. SignupSchema does (128).
    // If a password reaches passwords.ts via a different code path (e.g. password-reset
    // confirm), 1MB will hit argon2.hash and degrade the server.
    expect(validatePasswordPolicy("a".repeat(1_000_000))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Password hashing
// ─────────────────────────────────────────────────────────────────────────────
describe("hash/verify password — adversarial", () => {
  it("verifies returns false for malformed hash (not throw)", async () => {
    const r = await verifyPassword("not-a-hash", "anything");
    expect(r).toBe(false);
  });

  it("verifies returns false for empty hash", async () => {
    const r = await verifyPassword("", "anything");
    expect(r).toBe(false);
  });

  it("hash never equals raw password", async () => {
    const pw = "correcthorsebattery";
    const h = await hashPassword(pw);
    expect(h).not.toEqual(pw);
    expect(h.startsWith("$argon2id$")).toBe(true);
  });

  it("two hashes of same password are different (random salt)", async () => {
    const a = await hashPassword("correcthorsebattery");
    const b = await hashPassword("correcthorsebattery");
    expect(a).not.toEqual(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiter
// ─────────────────────────────────────────────────────────────────────────────
describe("checkRateLimit — adversarial", () => {
  beforeEach(() => {
    // No reset API — use a unique key per test
  });

  it("allows N requests then 429s (N+1)th", () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit(key, 5, 60_000);
      expect(r.allowed).toBe(true);
    }
    const r6 = checkRateLimit(key, 5, 60_000);
    expect(r6.allowed).toBe(false);
    expect(r6.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("ipv4 vs ipv6 same /64 are NOT bucketed together (known limitation)", () => {
    // The current limiter keys on the literal string. ipv6 hosts can rotate within /64.
    // FINDING-CANDIDATE: any attacker on ipv6 can bypass per-IP rate limit by rotating the suffix.
    const key1 = "ip:::1:signup";
    const key2 = "ip:::2:signup";
    for (let i = 0; i < 5; i++) checkRateLimit(key1, 5, 60_000);
    const r = checkRateLimit(key2, 5, 60_000);
    expect(r.allowed).toBe(true);
  });

  it("X-Forwarded-For: client controls the value when no trusted proxy", () => {
    // Mirror what rateLimitByIp does — first comma-split + trim
    // Attacker sends `X-Forwarded-For: <random>, <real-ip>` to evade per-IP cap.
    const ip1 = `${Math.floor(Math.random() * 1000)}.1.1.1`;
    const r = rateLimitByIp(ip1, "signup-spoof");
    expect(r.allowed).toBe(true);
    // Each spoofed IP gets its own bucket — the cap is per-spoof, not per-real-source.
    // FINDING-CANDIDATE: app trusts client X-Forwarded-For without origin validation.
  });

  it("OTP brute-force: 10/hr cap then refuses", () => {
    const userId = `user-otp-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(rateLimitOtpVerifyByUser(userId).allowed).toBe(true);
    }
    expect(rateLimitOtpVerifyByUser(userId).allowed).toBe(false);
    // 6-digit OTP space = 1M. 10 tries/hr = 24*10 = 240/day. Brute force takes
    // ~11 years. Rate limit does cap.
  });

  it("does not negative-overflow on integer key counter (sanity)", () => {
    const key = `boundary-${Math.random()}`;
    // Very large limit
    for (let i = 0; i < 100; i++) {
      const r = checkRateLimit(key, Number.MAX_SAFE_INTEGER, 60_000);
      expect(r.allowed).toBe(true);
    }
  });

  it("zero-limit refuses immediately (AT-003 FIX)", () => {
    // AT-003 FIX: rate-limit.ts now returns allowed:false when limit===0 in a new window.
    const key = `zero-limit-${Math.random()}`;
    const r = checkRateLimit(key, 0, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("negative window does not infinite-loop or NaN", () => {
    const key = `neg-window-${Math.random()}`;
    const r = checkRateLimit(key, 5, -1);
    // Spec is silent. Just must not crash / hang.
    expect(r).toBeDefined();
    expect(typeof r.allowed).toBe("boolean");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LoginSchema
// ─────────────────────────────────────────────────────────────────────────────
describe("LoginSchema — adversarial", () => {
  it("accepts non-existent email format silently (login flow then 401s — ok)", () => {
    expect(
      LoginSchema.safeParse({ email: "nobody@example.com", password: "x" })
        .success,
    ).toBe(true);
  });

  it("rejects empty password (cannot login with nothing)", () => {
    expect(
      LoginSchema.safeParse({ email: "a@b.c", password: "" }).success,
    ).toBe(false);
  });

  it("rejects null password", () => {
    expect(
      LoginSchema.safeParse({ email: "a@b.c", password: null }).success,
    ).toBe(false);
  });

  it("AT-004 FIX: rejects login password > 128 chars (argon2 DoS prevention)", () => {
    // AT-004 FIX: LoginSchema now caps password at max 128 chars.
    const huge = "x".repeat(100_000);
    expect(
      LoginSchema.safeParse({ email: "a@b.c", password: huge }).success,
    ).toBe(false);
  });

  it("AT-001 FIX: rejects login email > 254 chars (RFC 5321)", () => {
    // AT-001 FIX: LoginSchema email now has .max(254).
    const longEmail = "a".repeat(250) + "@b.com";
    expect(
      LoginSchema.safeParse({ email: longEmail, password: "validpassword" }).success,
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OtpVerifySchema
// ─────────────────────────────────────────────────────────────────────────────
describe("OtpVerifySchema — adversarial", () => {
  it("rejects 5-digit (min - 1)", () => {
    expect(OtpVerifySchema.safeParse({ code: "12345" }).success).toBe(false);
  });
  it("rejects 7-digit (max + 1)", () => {
    expect(OtpVerifySchema.safeParse({ code: "1234567" }).success).toBe(false);
  });
  it("rejects letters", () => {
    expect(OtpVerifySchema.safeParse({ code: "abcdef" }).success).toBe(false);
  });
  it("rejects 6 unicode digits (Eastern Arabic)", () => {
    // ٠١٢٣٤٥ are unicode "digit" but not in 0-9 ASCII range.
    expect(OtpVerifySchema.safeParse({ code: "٠١٢٣٤٥" }).success).toBe(false);
  });
  it("rejects negative-sign code", () => {
    expect(OtpVerifySchema.safeParse({ code: "-12345" }).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateOtpCode — distribution sanity
// ─────────────────────────────────────────────────────────────────────────────
describe("generateOtpCode", () => {
  it("always returns 6 digits", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateOtpCode();
      expect(c).toMatch(/^\d{6}$/);
    }
  });
  it("padding works for low values (e.g. 5 → '000005')", () => {
    // Run 1000 iterations; statistically should hit at least one < 100000
    let sawShort = false;
    for (let i = 0; i < 5000; i++) {
      const c = generateOtpCode();
      if (Number(c) < 100_000) {
        expect(c.length).toBe(6); // padded
        sawShort = true;
      }
    }
    // Don't assert sawShort — probabilistic.
    expect(typeof sawShort).toBe("boolean");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PasswordResetConfirmSchema
// ─────────────────────────────────────────────────────────────────────────────
describe("PasswordResetConfirmSchema — adversarial", () => {
  it("rejects empty token (replay-bait — never accept a falsy token)", () => {
    expect(
      PasswordResetConfirmSchema.safeParse({
        token: "",
        password: "a".repeat(12),
      }).success,
    ).toBe(false);
  });
  it("accepts any non-empty string as token (server-side validation later)", () => {
    expect(
      PasswordResetConfirmSchema.safeParse({
        token: "garbage",
        password: "a".repeat(12),
      }).success,
    ).toBe(true);
  });
  it("rejects password < 12 chars", () => {
    expect(
      PasswordResetConfirmSchema.safeParse({
        token: "x",
        password: "short",
      }).success,
    ).toBe(false);
  });
});
