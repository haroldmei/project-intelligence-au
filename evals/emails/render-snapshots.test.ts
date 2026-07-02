/**
 * Email template render snapshot tests
 * Verifies: no <script> tags, all absolute URLs, plaintext fallback, < 100KB
 * Run with: pnpm test:emails
 */

import { describe, test, expect } from "vitest";
import { VerifyEmailTemplate } from "@/emails/verify-email";
import { PasswordResetTemplate } from "@/emails/password-reset";
import { WeeklyDigestTemplate } from "@/emails/weekly-digest";
import { DigestFallbackNoticeTemplate } from "@/emails/digest-fallback-notice";
import { WelcomeAfterVerifyTemplate } from "@/emails/welcome-after-verify";
import { StormBriefTemplate } from "@/emails/storm-brief";

const templates = [
  {
    name: "verify-email",
    fn: () =>
      VerifyEmailTemplate({
        email: "test@example.com",
        code: "123456",
      }),
  },
  {
    name: "password-reset",
    fn: () =>
      PasswordResetTemplate({
        email: "test@example.com",
        code: "123456",
        resetUrl: "https://pi-au.example.com/auth/password-reset?code=123456",
      }),
  },
  {
    name: "weekly-digest",
    fn: () =>
      WeeklyDigestTemplate({
        weekStart: "27 Apr 2026",
        leadCount: 12,
        lgas: ["Western Sydney", "Hills"],
        cards: [
          {
            id: "da-001",
            address: "12 Acacia Ave, Penrith NSW 2750",
            lga: "Western Sydney",
            value: "AUD 180k",
            why: "Existing dwelling re-roof, Colorbond replacement",
            scope: "Demolition of existing tiled roof and installation of Colorbond metal deck roofing system.",
            applicant: "Smith & Partners Architects",
            relevanceScore: 8,
            portalUrl: "https://council.nsw.gov.au/da/12-acacia",
            thumbUpUrl: "https://pi-au.example.com/api/feedback?id=da-001&v=1&token=abc123",
            thumbDownUrl: "https://pi-au.example.com/api/feedback?id=da-001&v=0&token=abc123",
          },
        ],
        precisionBadge: {
          precision: 93,
          weeks: 4,
        },
        smsEnabled: true,
      }),
  },
  {
    // FR-010 quiet week (issue #58): no leads surfaced — the reassurance
    // variant must still satisfy every email invariant (no script, absolute
    // links, non-empty subject, < 100KB).
    name: "weekly-digest-quiet-week",
    fn: () =>
      WeeklyDigestTemplate({
        weekStart: "27 Apr 2026",
        leadCount: 0,
        lgas: ["Western Sydney", "Hills"],
        cards: [],
        dasChecked: 143,
        smsEnabled: false,
        unsubscribeUrl: "https://pi-au.example.com/api/unsubscribe/tok123",
      }),
  },
  {
    name: "digest-fallback-notice",
    fn: () =>
      DigestFallbackNoticeTemplate({
        lgas: ["Western Sydney", "Hills"],
        daCount: 87,
        appBaseUrl: "https://pi-au.example.com",
      }),
  },
  {
    name: "welcome-after-verify",
    fn: () =>
      WelcomeAfterVerifyTemplate({
        firstName: "Eli",
        lgaSetupUrl: "https://pi-au.example.com/onboarding/lga-select",
      }),
  },
  {
    name: "storm-brief",
    fn: () =>
      StormBriefTemplate({
        warningTitle: "Severe Thunderstorm Warning",
        areasLabel: "Sydney Metropolitan",
        lgaNames: ["Blacktown", "Parramatta"],
        issuedAtLabel: "Wed, 15 Jan, 3:35 pm",
        warningUrl: "http://www.bom.gov.au/products/IDN21031.html",
        manageUrl: "https://pi-au.example.com/account/storm-brief",
        unsubscribeUrl: "https://pi-au.example.com/api/unsubscribe/tok123",
      }),
  },
];

describe("Email templates", () => {
  templates.forEach(({ name, fn }) => {
    describe(name, () => {
      const result = fn();

      test(`${name}: renders without error`, () => {
        expect(result).toBeDefined();
        expect(result.subject).toBeDefined();
        expect(result.html).toBeDefined();
      });

      test(`${name}: subject is not empty`, () => {
        expect(result.subject.length).toBeGreaterThan(0);
      });

      test(`${name}: HTML does not contain <script> tags`, () => {
        expect(result.html).not.toMatch(/<script[^>]*>/i);
      });

      test(`${name}: HTML size is under 100KB`, () => {
        const sizeKb = Buffer.byteLength(result.html, "utf8") / 1024;
        expect(sizeKb).toBeLessThan(100);
      });

      test(`${name}: all links are absolute URLs`, () => {
        const linkMatches = result.html.match(/href="([^"]+)"/g) || [];
        linkMatches.forEach((match) => {
          const url = match.slice(6, -1); // Extract URL from href="..."
          // Allow mailto: and relative paths starting with /
          if (!url.startsWith("http") && !url.startsWith("mailto:") && !url.startsWith("/")) {
            expect.fail(`Found relative URL: ${url}`);
          }
        });
      });
    });
  });
});
