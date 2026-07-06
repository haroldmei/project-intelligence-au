/**
 * email-optin-reenable.spec.ts — issue #105
 *
 * Email unsubscribe used to be a permanent dead-end: the only write to
 * emailOptIn anywhere was `false` (the token unsubscribe link), and no route or
 * UI ever set it back to true — so a paying subscriber who unsubscribed kept
 * being billed while receiving nothing, with no in-product recovery.
 *
 * Acceptance criterion: an authenticated user whose emailOptIn is false can flip
 * it back to true from the portal — a visible toggle on /account/sms whose POST
 * succeeds, is reflected by /api/account/me, and survives a reload.
 *
 * Requires a real DB + session — the toggle reads /api/account/me and writes the
 * authenticated opt-in/out routes. Gated on PLAYWRIGHT_DB=1; the real signup in
 * the seed-user fixture needs TEST_OTP_OVERRIDE=123456 in the backend env.
 */
import { test, expect } from "./fixtures/seed-user";

const DB_AVAILABLE = process.env.PLAYWRIGHT_DB === "1";

test.describe("Email digest re-enable control (issue #105)", () => {
  test("an unsubscribed user re-enables the email digest from the notifications page", async ({
    authedPage: page,
  }) => {
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — toggle needs real session + /api/account/me");

    // Simulate the post-unsubscribe DB state (emailOptIn=false). The token link
    // and this authenticated route land on the identical column write; using the
    // authed route keeps the test from needing the server's HMAC secret.
    const optOut = await page.request.post("/api/account/email-opt-out");
    expect(optOut.ok()).toBeTruthy();
    await expect.poll(async () => (await (await page.request.get("/api/account/me")).json()).emailOptIn).toBe(false);

    // The notifications page shows the email toggle OFF with a recovery prompt.
    await page.goto("/account/sms");
    const emailToggle = page.getByRole("switch", { name: /email digest/i });
    await expect(emailToggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(/unsubscribed from the email digest/i)).toBeVisible();

    // Flip it back on — the in-product recovery that never existed before.
    await emailToggle.click();
    await expect(emailToggle).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/email digest enabled/i)).toBeVisible();

    // /api/account/me now reports the user re-subscribed…
    await expect
      .poll(async () => (await (await page.request.get("/api/account/me")).json()).emailOptIn)
      .toBe(true);

    // …and the state survives a reload (persisted, not just optimistic UI).
    await page.reload();
    await expect(page.getByRole("switch", { name: /email digest/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
