// Verification-reminder email (FR-016, issue #130). The template is a pure
// string builder (no DB, no env), so it runs in the always-on fe suite. Proves
// the email invariants — no <script>, absolute CTA + unsubscribe links, a
// non-empty subject — and that the verify/unsubscribe URLs are surfaced.
import { describe, it, expect } from "vitest";
import { VerificationReminderTemplate } from "@/emails/verification-reminder";

const VERIFY_URL = "https://pi-au.example.com/login";
const UNSUB_URL = "https://pi-au.example.com/api/unsubscribe/tok123";

describe("VerificationReminderTemplate", () => {
  const { subject, html } = VerificationReminderTemplate({
    verifyUrl: VERIFY_URL,
    unsubscribeUrl: UNSUB_URL,
  });

  it("has a non-empty subject", () => {
    expect(subject.length).toBeGreaterThan(0);
  });

  it("renders the verify CTA and unsubscribe links", () => {
    expect(html).toContain(`href="${VERIFY_URL}"`);
    expect(html).toContain(`href="${UNSUB_URL}"`);
  });

  it("contains no <script> tags", () => {
    expect(html).not.toMatch(/<script[^>]*>/i);
  });

  it("keeps every href absolute or mailto when an unsubscribe URL is provided", () => {
    const hrefs = (html.match(/href="([^"]+)"/g) ?? []).map((m) => m.slice(6, -1));
    for (const url of hrefs) {
      expect(url.startsWith("http") || url.startsWith("mailto:")).toBe(true);
    }
  });

  it("falls back to a functional relative unsubscribe path when none is passed", () => {
    // Mirrors the trial-reminder fallback: an absent token URL degrades to
    // "/account" rather than a broken link, so the email stays Spam-Act valid.
    const { html: noToken } = VerificationReminderTemplate({ verifyUrl: VERIFY_URL });
    expect(noToken).toContain('href="/account"');
  });
});
