/**
 * verify-gate.spec.ts — issue #180
 *
 * Signup mints a valid Lucia session with emailVerified=false, but the Sunday
 * digest cron only sends to emailVerified:true users. Before the gate, an
 * unverified user could reach /digest and see "your first digest arrives Sunday"
 * yet never receive one — a silent, permanent dead end.
 *
 * Acceptance criterion: an authenticated-but-unverified session requesting
 * /digest (and /account) is redirected to /verify and never renders the digest;
 * after successful OTP verification the same session reaches /digest.
 *
 * Requires a real DB — the portal layout gate runs server-side (RSC) and cannot
 * be exercised with page.route() stubs (see BUG-002). Gated on PLAYWRIGHT_DB=1;
 * OTP verification needs TEST_OTP_OVERRIDE=123456 in the backend env.
 */
import { test, expect, TEST_OTP } from "./fixtures/seed-user";

const DB_AVAILABLE = process.env.PLAYWRIGHT_DB === "1";

test.describe("Portal verification gate (issue #180)", () => {
  test("unverified session is bounced from /digest and /account to /verify, then reaches /digest after OTP", async ({
    page,
    user,
  }) => {
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — portal layout gate needs DB auth (BUG-002)");

    // ── Sign up → valid session, emailVerified=false, lands on /onboarding/area
    await page.goto("/signup");
    await page.fill('[id="email"]', user.email);
    await page.fill('[id="password"]', user.password);
    await page.fill('[id="mobile_e164"]', "400000000");
    await page.check('[id="acceptTerms"]');
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding/area");

    // ── Unverified user requesting /digest is redirected to /verify ───────────
    await page.goto("/digest");
    await page.waitForURL("**/verify");
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
    // The digest empty-state promise must NOT be shown to an unverified user.
    await expect(page.getByText(/your first digest arrives sunday/i)).toHaveCount(0);
    await expect(page.locator("article[aria-label]")).toHaveCount(0);

    // ── /account is gated the same way ────────────────────────────────────────
    await page.goto("/account");
    await page.waitForURL("**/verify");
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();

    // ── Verify the OTP (static override) → session becomes verified ───────────
    for (let i = 0; i < 6; i++) {
      await page.fill(`#otp-${i}`, TEST_OTP[i]);
    }
    await page.click('button:has-text("Verify email")');
    await page.waitForURL("**/area");

    // ── The same session now reaches /digest — no bounce to /verify ───────────
    await page.goto("/digest");
    await expect(page).toHaveURL(/\/digest/);
    await expect(page.getByRole("heading", { name: /check your email/i })).toHaveCount(0);
  });
});
