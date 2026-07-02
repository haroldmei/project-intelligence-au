// Unit tests for waitlist validation + normalisation (issue #25). No DB.
import { describe, it, expect } from "vitest";
import {
  WaitlistInput,
  isHoneypotTripped,
  normalizeWaitlistEntry,
} from "@/modules/waitlist/schemas";

describe("WaitlistInput schema", () => {
  it("accepts a minimal valid submission and defaults source to 'landing'", () => {
    const parsed = WaitlistInput.safeParse({
      email: "bob@example.com",
      trade: "plumbing",
      region: "Melbourne",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.source).toBe("landing");
  });

  it("rejects an invalid email", () => {
    const parsed = WaitlistInput.safeParse({ email: "nope", trade: "plumbing", region: "Melbourne" });
    expect(parsed.success).toBe(false);
  });

  it("rejects blank trade / region (after trim)", () => {
    const parsed = WaitlistInput.safeParse({ email: "a@b.com", trade: "   ", region: "Melbourne" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown source", () => {
    const parsed = WaitlistInput.safeParse({
      email: "a@b.com",
      trade: "plumbing",
      region: "Melbourne",
      source: "referral",
    });
    expect(parsed.success).toBe(false);
  });

  it("caps trade/region/note length", () => {
    const long = "x".repeat(81);
    expect(WaitlistInput.safeParse({ email: "a@b.com", trade: long, region: "Perth" }).success).toBe(false);
    expect(
      WaitlistInput.safeParse({ email: "a@b.com", trade: "tiling", region: "Perth", note: "y".repeat(501) }).success
    ).toBe(false);
  });
});

describe("isHoneypotTripped", () => {
  it("is false when the honeypot is absent or empty", () => {
    expect(isHoneypotTripped({ email: "a@b.com", trade: "t", region: "r", source: "landing" })).toBe(false);
    expect(
      isHoneypotTripped({ email: "a@b.com", trade: "t", region: "r", source: "landing", company: "  " })
    ).toBe(false);
  });

  it("is true when the honeypot is filled", () => {
    expect(
      isHoneypotTripped({ email: "a@b.com", trade: "t", region: "r", source: "landing", company: "Acme" })
    ).toBe(true);
  });
});

describe("normalizeWaitlistEntry", () => {
  it("lowercases email/trade/region and drops the honeypot", () => {
    const row = normalizeWaitlistEntry({
      email: "  Bob@Example.COM ",
      trade: " Roofing ",
      region: " Melbourne ",
      source: "landing",
      company: "spam",
    });
    expect(row).toEqual({
      email: "bob@example.com",
      trade: "roofing",
      region: "melbourne",
      note: null,
      source: "landing",
    });
  });

  it("keeps a trimmed note when present", () => {
    const row = normalizeWaitlistEntry({
      email: "a@b.com",
      trade: "tiling",
      region: "perth",
      note: "  urgent  ",
      source: "signup",
    });
    expect(row.note).toBe("urgent");
    expect(row.source).toBe("signup");
  });
});
