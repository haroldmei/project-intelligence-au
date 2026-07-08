/**
 * feedback-returnto.spec.ts
 *
 * Regression for issue #137: tapping a digest-email 👍/👎 in a browser with no
 * PI-AU session records the vote, then 302s to /digest?feedback=recorded — but
 * the portal auth wall used to redirect to a BARE /login with no returnTo, so
 * the "feedback recorded" confirmation was lost and never shown (the common
 * mobile case). The fix carries the intended destination through the wall as
 * ?returnTo and the login page honours it on success.
 *
 * Test 1 is deterministic: the RSC auth gate returns null for a missing session
 * cookie WITHOUT hitting the DB, so the bounce to /login?returnTo=… needs only
 * the dev server. Test 2 drives the whole tap→wall→login→toast journey against a
 * real backend and self-skips when signup can't reach a DB.
 */
import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";

const HMAC_SECRET = process.env.FEEDBACK_HMAC_SECRET;
const TEST_OTP = "123456";

// The exact URL the feedback route (src/app/api/feedback/[token]/route.ts)
// redirects to after recording a vote.
const CONFIRM_URL = "/digest?feedback=recorded&daId=da-1&vote=up";

function issueFeedbackToken(userId: string, daId: string, vote: 1 | 0): string {
  const payload = { userId, daId, vote, issuedAt: Math.floor(Date.now() / 1000) };
  const sig = createHmac("sha256", HMAC_SECRET!).update(JSON.stringify(payload)).digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

test.describe("digest feedback tap without a session (issue #137)", () => {
  test("the confirmation URL bounces to /login but preserves it in ?returnTo (not lost)", async ({
    page,
  }) => {
    // Fresh context (Playwright default) → no lucia_session cookie.
    await page.goto(CONFIRM_URL);

    // Server-side auth gate sends us to login…
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");

    // …but the intended destination — including the feedback=recorded toast
    // flag — must survive as ?returnTo. This is the whole bug: without it the
    // confirmation is gone.
    const returnTo = url.searchParams.get("returnTo");
    expect(returnTo, "login must carry ?returnTo").toBeTruthy();
    expect(returnTo).toContain("feedback=recorded");
    expect(returnTo).toContain("/digest");
  });

  test("a real email feedback link (no session) reaches login with the confirmation intact", async ({
    page,
  }) => {
    test.skip(!HMAC_SECRET, "Requires FEEDBACK_HMAC_SECRET to mint a token the dev server accepts");

    const token = issueFeedbackToken("user-137", "da-1", 1);
    // Byte-for-byte the URL shape buildFeedbackUrl() puts in the email.
    await page.goto(`/api/feedback/${encodeURIComponent(token)}`);

    // /api/feedback → /digest?feedback=recorded → (no session) → /login?returnTo
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    const returnTo = new URL(page.url()).searchParams.get("returnTo") ?? "";
    expect(returnTo).toContain("feedback=recorded");
  });

  test("full journey: tap → login wall → back on /digest showing the confirmation", async ({
    page,
    context,
  }) => {
    const creds = await realSignup(page).catch(() => null);
    test.skip(!creds, "Requires a reachable DB + TEST_OTP_OVERRIDE for real signup");

    // Simulate opening the Sunday email in a browser that isn't logged in.
    await context.clearCookies();

    await page.goto(CONFIRM_URL);
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    const returnTo = new URL(page.url()).searchParams.get("returnTo") ?? "";
    expect(returnTo).toContain("feedback=recorded");

    // Log in — the login page must send us to ?returnTo, not a bare /digest.
    await expect(page.getByRole("heading", { name: /log in/i })).toBeVisible();
    await page.fill("#email", creds!.email);
    await page.fill("#password", creds!.password);
    await page.getByRole("button", { name: /^log in$/i }).click();

    // Land back on the digest with the confirmation the tap earned.
    await page.waitForURL(/\/digest\?.*feedback=recorded/, { timeout: 15_000 });
    await expect(
      page.getByText(/your feedback was recorded/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});

/** Real signup + OTP verify; returns the credentials or throws if no backend. */
async function realSignup(page: Page): Promise<{ email: string; password: string }> {
  const uid = Math.random().toString(36).slice(2, 10);
  const email = `test+${uid}@example.com`;
  const password = "TestPassword123!";

  await page.goto("/signup");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.fill("#mobile_e164", "400000137");
  await page.check("#acceptTerms");
  await page.click('button[type="submit"]');

  await page.waitForURL("**/verify", { timeout: 15_000 });
  for (let i = 0; i < 6; i++) {
    await page.fill(`#otp-${i}`, TEST_OTP[i]);
  }
  await page.click('button:has-text("Verify email")');
  await page.waitForURL("**/area", { timeout: 15_000 });
  return { email, password };
}
