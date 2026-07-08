/**
 * verify-change-email.spec.ts (issue #92)
 *
 * The activation dead-end: a tradie fat-fingers their signup email, lands on
 * /verify where the OTP never arrives, and previously had no way to fix it.
 *
 * This drives the whole recovery path: sign up with a typo → see the (wrong)
 * address on /verify → correct it inline → receive a fresh code → verify.
 *
 * All server responses are mocked via page.route() so the test runs without a
 * DB, matching the house style in auth.spec.ts.
 */
import { test, expect, type Page } from "@playwright/test";

const TYPO_EMAIL = "eil@exmaple.com";
const FIXED_EMAIL = "eli@example.com";

// The cookie banner is a fixed overlay that intercepts clicks/fills on the lower
// part of every page until dismissed (see billing-lifecycle-prod.spec.ts).
async function dismissCookieBanner(page: Page): Promise<void> {
  const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
  // The banner mounts client-side after hydration — wait for it before trying
  // to dismiss, otherwise it reappears and intercepts later interactions.
  await banner.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  const close = page.getByRole("button", { name: /close cookie banner|reject analytics cookies/i });
  if (await close.first().isVisible().catch(() => false)) {
    await close.first().click();
    await banner.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  }
}

test.describe("Verify — change a mistyped email (issue #92)", () => {
  test("sign up with a typo, correct the email on /verify, then verify", async ({ page }) => {
    // Pending account state the mocked /api/auth/me reflects. The change-email
    // route flips it to the corrected address.
    let pendingEmail = TYPO_EMAIL;
    let changeEmailCalledWith: string | null = null;

    await page.route("**/api/auth/signup", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ userId: "u1", otpDispatched: true, nextStep: "/onboarding/area" }),
        headers: { "Set-Cookie": "lucia_session=valid; Path=/; HttpOnly; SameSite=Lax" },
      });
    });

    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ userId: "u1", email: pendingEmail, emailVerified: false }),
      });
    });

    await page.route("**/api/auth/verify-email/change-email", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      changeEmailCalledWith = body.email;
      pendingEmail = FIXED_EMAIL; // subsequent /api/auth/me now shows the fix
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ email: FIXED_EMAIL, sent: true }),
      });
    });

    await page.route("**/api/auth/verify-email", async (route) => {
      // Only the exact verify endpoint (not the /resend or /change-email children).
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ verified: true }),
      });
    });

    // ── Sign up with the typo → lands on /onboarding/area (issue #230) ───────
    await page.goto("/signup");
    await dismissCookieBanner(page);
    await page.fill("#email", TYPO_EMAIL);
    await page.fill("#password", "TestPassword123!");
    await page.fill("#mobile_e164", "400000009");
    await page.check("#acceptTerms");
    await page.click('button[type="submit"]');

    // The user lands on /onboarding/area, not /verify — OTP is not required
    // before LGA setup. Navigate to /verify manually to test the change-email
    // recovery path (the test's actual concern).
    await page.waitForURL(/\/onboarding\/area/, { timeout: 10_000 });
    await page.goto("/verify");

    // ── /verify shows the (wrong) address — the typo is now visible ──────────
    await page.waitForURL(/\/verify/, { timeout: 10_000 });
    await expect(page.getByText(TYPO_EMAIL)).toBeVisible();

    // ── Correct the email inline ─────────────────────────────────────────────
    await page.getByRole("button", { name: /wrong email\? change it/i }).click();
    await page.fill("#change-email", FIXED_EMAIL);
    await page.getByRole("button", { name: /update & resend code/i }).click();

    // The corrected address is now shown and a fresh code was requested.
    await expect(page.getByText(FIXED_EMAIL)).toBeVisible();
    await expect(page.getByText(/a new code has been sent/i)).toBeVisible();
    expect(changeEmailCalledWith).toBe(FIXED_EMAIL);

    // ── Enter the OTP and verify ─────────────────────────────────────────────
    // handleInput distributes a multi-digit value across all six cells.
    await page.fill("#otp-0", "123456");
    await page.getByRole("button", { name: /verify email/i }).click();

    // Verification succeeds → onboarding.
    await page.waitForURL(/\/onboarding\/area/, { timeout: 10_000 });
  });
});
