/**
 * Playwright fixture: seed-user
 *
 * Creates a fresh test user via POST /api/auth/signup before each test and
 * cleans it up via DELETE /api/account afterwards.
 *
 * The demo user from prisma/seed.ts (eli@example.com) is used as the template
 * but each test gets a unique email (test+<uuid>@example.com) to avoid
 * cross-test state pollution.
 *
 * STUB_DB mode:
 *   Set STUB_DB=1 to skip the real API calls and instead use Playwright's
 *   page.route() to intercept network requests and return MSW-style stubs.
 *   Use this when the local DB / dev server is not running:
 *
 *     STUB_DB=1 pnpm test:e2e
 *
 *   In stub mode, the fixture sets up route handlers for all auth and data
 *   endpoints so the UI rendering path is exercised without a real backend.
 *
 * OTP override:
 *   In test environments the API should check for TEST_OTP_OVERRIDE env var.
 *   The fixture passes the static OTP "123456" in all verify-email calls.
 *   Set TEST_OTP_OVERRIDE=123456 in your .env.test or pass via env.
 */

import { test as base, type Page } from "@playwright/test";

export type TestUser = {
  email: string;
  password: string;
  mobile_e164: string;
  trade: string;
  /** The lucia_session cookie value set after signup */
  sessionCookie?: string;
};

const STUB_DB = process.env.STUB_DB === "1";

const DEFAULT_PASSWORD = "TestPassword123!";
const TEST_OTP = "123456";

/** Stub API responses used when STUB_DB=1 */
async function installApiStubs(page: Page, user: TestUser) {
  // Auth
  await page.route("**/api/auth/signup", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ userId: "stub-user-id", otpDispatched: true, nextStep: "/onboarding/area" }),
      headers: { "Set-Cookie": "lucia_session=stub-session; Path=/; HttpOnly; SameSite=Lax" },
    });
  });

  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session_set: true }),
      headers: { "Set-Cookie": "lucia_session=stub-session; Path=/; HttpOnly; SameSite=Lax" },
    });
  });

  await page.route("**/api/auth/logout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        userId: "stub-user-id",
        email: user.email,
        emailVerified: true,
        subscriptionStatus: "trial",
        trade: "roofing",
        sessionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
  });

  // OTP: both the real verify-email endpoint and the legacy /api/auth/otp path
  await page.route("**/api/auth/verify-email", async (route) => {
    const body = await route.request().postDataJSON().catch(() => ({}));
    const code = body?.code ?? "";
    if (code === TEST_OTP || STUB_DB) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ verified: true }),
      });
    } else {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid or expired OTP code." }),
      });
    }
  });

  await page.route("**/api/auth/otp", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ verified: true }),
    });
  });

  await page.route("**/api/auth/otp/resend", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sent: true }) });
  });

  await page.route("**/api/auth/verify-email/resend", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sent: true }) });
  });

  await page.route("**/api/auth/password-reset/request", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/api/auth/password-reset/confirm", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  // Account
  await page.route("**/api/account/lga-bundles", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bundle_ids: ["western_sydney"] }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundle_ids: ["western_sydney"] }) });
    }
  });

  await page.route("**/api/account/lga", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/api/account/me", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "acc_stub",
          userId: "stub-user-id",
          lgaBundles: ["western_sydney"],
          savedQueryText: "Roof replacement, Colorbond or tile, residential, $80k+",
          smsOptIn: true,
        }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
  });

  await page.route("**/api/account/sms-opt-in", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ smsOptIn: true }) });
  });

  await page.route("**/api/account/sms-opt-out", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ smsOptIn: false }) });
  });

  // Billing
  await page.route("**/api/billing/checkout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ checkout_url: "https://checkout.stripe.com/test/stub" }),
    });
  });

  await page.route("**/api/billing/subscription", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/api/billing/portal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ portal_url: "https://billing.stripe.com/test/stub" }),
    });
  });

  // Digests
  await page.route("**/api/digests/current", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(stubDigest()),
    });
  });

  await page.route("**/api/digests", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(stubDigestHistory()),
    });
  });

  // Feedback
  await page.route("**/api/portal/feedback", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/api/feedback", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
}

/** 12-card stub digest matching the wedge spec */
export function stubDigest() {
  const das = Array.from({ length: 12 }, (_, i) => ({
    id: `2025/${100000 + i}`,
    address: `${10 + i} Acacia Ave, Penrith NSW 2750`,
    lga: i % 2 === 0 ? "Western Sydney" : "Hills District",
    relevanceScore: 7 + (i % 3),
    estimatedValue: 150000 + i * 10000,
    whyMatched: "Existing dwelling re-roof, Colorbond replacement",
    scopeText:
      "Demolition of existing tiled roof and installation of Colorbond metal deck roofing system including new guttering and downpipes.",
    applicantName: "Smith & Partners Architects",
    portalUrl: `https://da.example.gov.au/DA/${100000 + i}`,
  }));
  return {
    weekDate: "27 Apr 2026",
    leadCount: 12,
    areaLabel: "Western Sydney + Hills",
    // Rated-lead recap (issue #186): the user's own on-target rate, not precision.
    ratedLeadRecap: { onTarget: 14, rated: 15, rate: 93, weeks: 4 },
    weeksOfHistory: 4,
    das,
  };
}

export function stubDigestHistory() {
  return [
    {
      id: "digest_123",
      weekDate: "27 Apr 2026",
      leadCount: 12,
      areaLabel: "Western Sydney + Hills",
      ratedLeadRecap: { onTarget: 14, rated: 15, rate: 93, weeks: 4 },
    },
    {
      id: "digest_122",
      weekDate: "20 Apr 2026",
      leadCount: 8,
      areaLabel: "Western Sydney",
    },
    {
      id: "digest_121",
      weekDate: "13 Apr 2026",
      leadCount: 14,
      areaLabel: "Western Sydney + Hills",
      ratedLeadRecap: { onTarget: 10, rated: 11, rate: 91, weeks: 4 },
    },
  ];
}

export type SeedUserFixtures = {
  user: TestUser;
  authedPage: Page;
};

export const test = base.extend<SeedUserFixtures>({
  user: async ({}, use) => {
    const uid = Math.random().toString(36).slice(2, 10);
    const user: TestUser = {
      email: `test+${uid}@example.com`,
      password: DEFAULT_PASSWORD,
      mobile_e164: "+61400000000",
      trade: "roofing",
    };
    await use(user);
    // Cleanup: delete user if real DB (best-effort; ignore errors)
    if (!STUB_DB) {
      try {
        await fetch(`http://localhost:3000/api/account/delete`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // ignore
      }
    }
  },

  authedPage: async ({ page, user }, use) => {
    if (STUB_DB) {
      await installApiStubs(page, user);
      // Navigate to a page so cookies are in scope, then inject a stub session cookie
      await page.goto("/");
      await page.context().addCookies([
        {
          name: "lucia_session",
          value: "stub-session",
          domain: "localhost",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    } else {
      // Real signup → sets session cookie in browser context
      await page.goto("/signup");
      await page.fill('[id="email"]', user.email);
      await page.fill('[id="password"]', user.password);
      await page.fill('[id="mobile_e164"]', "400000000");
      await page.check('[id="acceptTerms"]');
      await page.click('button[type="submit"]');
      // Wait for OTP page
      await page.waitForURL("**/verify");
      // Fill deterministic OTP (requires TEST_OTP_OVERRIDE=123456 in backend env)
      for (let i = 0; i < 6; i++) {
        await page.fill(`#otp-${i}`, TEST_OTP[i]);
      }
      await page.click('button:has-text("Verify email")');
      await page.waitForURL("**/area");
    }
    await use(page);
  },
});

export { STUB_DB, TEST_OTP };
export { expect } from "@playwright/test";
