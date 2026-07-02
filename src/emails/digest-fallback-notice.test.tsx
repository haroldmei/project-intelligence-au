// Digest-fallback-notice email — keyword-only-mode CTA target (issue #55).
// Pure string builder (no DB, no @/lib/env), so it runs in the always-on fe
// suite. Proves the "View Digest in Portal" CTA points at the real /digest
// page on the configured origin and never at the non-existent /portal URL.
import { describe, it, expect } from "vitest";
import { DigestFallbackNoticeTemplate } from "@/emails/digest-fallback-notice";

const BASE = "https://app.projectintelligence.au";

describe("DigestFallbackNoticeTemplate", () => {
  const { subject, html } = DigestFallbackNoticeTemplate({
    lgas: ["Inner West", "Canterbury-Bankstown"],
    daCount: 7,
    appBaseUrl: BASE,
  });

  it("links the CTA to <appBaseUrl>/digest, not /portal", () => {
    expect(html).toContain(`href="${BASE}/digest"`);
    expect(html).not.toContain("/portal");
    // Guard against the old hardcoded placeholder origin.
    expect(html).not.toContain("pi-au.example.com");
  });

  it("renders the LGA list and DA count", () => {
    expect(html).toContain("Inner West + Canterbury-Bankstown");
    expect(html).toContain("7 development applications");
    expect(subject).toContain("keyword-only");
  });
});
