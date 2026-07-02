/**
 * cancel-subscription.spec.ts
 *
 * Tests:
 *   - open settings → click "Cancel subscription" link
 *   - AlertDialog shows correct period-end date
 *   - "Keep my plan" closes dialog
 *   - "Cancel subscription" confirm calls DELETE /api/billing/subscription
 *     and shows undo toast
 *
 * The account page uses stub data (periodEnd: "2026-05-24T00:00:00Z")
 * which should render as "Sat 24 May 2026" in en-AU locale.
 *
 * NOTE: The /account page is in the portal route group, which calls
 * validateRequest() server-side. Without a running DB this redirects to /login.
 * Set PLAYWRIGHT_DB=1 to run these tests against a seeded local DB.
 * Without it, all cancel-subscription tests are skipped (BUG-002).
 */
import { test, expect } from "@playwright/test";

const DB_AVAILABLE = process.env.PLAYWRIGHT_DB === "1";

const _STUB_PERIOD_END = "2026-05-24T00:00:00Z";
const FORMATTED_DATE = /24 May 2026/;

test.describe("Cancel Subscription Flow", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — portal layout needs DB auth (BUG-002). DELETE /api/billing/subscription also not implemented (BUG-003).");

    // Account page uses hardcoded stub — no auth needed for UI test
    await page.route("**/api/billing/subscription", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("Cancel subscription link is visible on account page", async ({ page }) => {
    await page.goto("/account");
    const cancelLink = page.getByRole("button", { name: /cancel subscription/i });
    await expect(cancelLink).toBeVisible();
  });

  test("clicking Cancel subscription opens AlertDialog", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: /cancel subscription/i }).click();

    // Dialog should appear with the title
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(
      page.getByRole("alertdialog").getByText(/cancel your subscription/i)
    ).toBeVisible();
  });

  test("AlertDialog shows correct period-end date", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: /cancel subscription/i }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    // Period end date should be formatted as "Sat 24 May 2026" or similar en-AU format
    await expect(dialog.getByText(FORMATTED_DATE)).toBeVisible();
  });

  test("clicking 'Keep my plan' closes the dialog", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: /cancel subscription/i }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    // Click the safe default action
    await dialog.getByRole("button", { name: /keep my plan/i }).click();

    // Dialog should be gone
    await expect(dialog).not.toBeVisible();
  });

  test("pressing Escape closes the dialog", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: /cancel subscription/i }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("confirming cancellation calls DELETE /api/billing/subscription", async ({ page }) => {
    let deleteCallMade = false;
    await page.route("**/api/billing/subscription", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCallMade = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/account");
    await page.getByRole("button", { name: /cancel subscription/i }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    // The destructive confirm button (also named "Cancel subscription")
    await dialog
      .getByRole("button", { name: /cancel subscription/i })
      .click();

    expect(deleteCallMade).toBe(true);
  });

  test("after cancellation confirmation, undo toast appears with period-end date", async ({ page }) => {
    await page.route("**/api/billing/subscription", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      } else {
        await route.continue();
      }
    });

    await page.goto("/account");
    await page.getByRole("button", { name: /cancel subscription/i }).click();

    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: /cancel subscription/i }).click();

    // Toast should mention the period end date
    const toast = page.getByRole("alert");
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await expect(toast).toContainText(FORMATTED_DATE);
  });

  test("cancellation API error shows error toast", async ({ page }) => {
    await page.route("**/api/billing/subscription", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Stripe error" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/account");
    await page.getByRole("button", { name: /cancel subscription/i }).click();

    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: /cancel subscription/i }).click();

    const toast = page.getByRole("alert");
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await expect(toast).toContainText(/something went wrong|try again/i);
  });
});
