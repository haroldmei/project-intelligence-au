import { describe, it, expect } from "vitest";
import {
  sanitizeReturnTo,
  buildLoginRedirect,
  DEFAULT_RETURN_TO,
} from "@/lib/auth/return-to";

// Issue #137 — an unauthenticated email feedback tap lands on
// /digest?feedback=recorded, gets bounced to /login, and must be able to return
// to the digest (with its confirmation toast) after logging in.
describe("sanitizeReturnTo", () => {
  it("keeps an internal absolute path (incl. query string) intact", () => {
    expect(sanitizeReturnTo("/digest?feedback=recorded&daId=da-1&vote=up")).toBe(
      "/digest?feedback=recorded&daId=da-1&vote=up",
    );
    expect(sanitizeReturnTo("/account")).toBe("/account");
  });

  it("falls back to the default for empty / missing input", () => {
    expect(sanitizeReturnTo(null)).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo("")).toBe(DEFAULT_RETURN_TO);
  });

  it("blocks open-redirects to external / protocol-relative targets", () => {
    expect(sanitizeReturnTo("https://evil.com")).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo("//evil.com")).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo("/\\evil.com")).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe(DEFAULT_RETURN_TO);
  });
});

describe("buildLoginRedirect", () => {
  it("preserves a non-default destination as an encoded ?returnTo", () => {
    const url = buildLoginRedirect("/digest?feedback=recorded&daId=da-1&vote=up");
    expect(url.startsWith("/login?returnTo=")).toBe(true);
    // The whole intended URL round-trips through decoding.
    const returnTo = new URL(url, "https://x").searchParams.get("returnTo");
    expect(returnTo).toBe("/digest?feedback=recorded&daId=da-1&vote=up");
  });

  it("omits the param when the target is the default destination", () => {
    expect(buildLoginRedirect("/digest")).toBe("/login");
    expect(buildLoginRedirect(null)).toBe("/login");
  });

  it("does not forward an external target into ?returnTo", () => {
    expect(buildLoginRedirect("//evil.com")).toBe("/login");
  });
});
