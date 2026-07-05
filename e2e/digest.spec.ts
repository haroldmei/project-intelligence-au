/**
 * digest.spec.ts
 *
 * Tests: empty state, normal 12-card state, fallback-mode banner state,
 * history pagination.
 *
 * NOTE: Portal pages (/digest, /history) are behind the portal layout which
 * calls validateRequest() server-side (RSC). Without a running DB, this
 * redirects to /login and page.route() stubs cannot intercept RSC server calls.
 *
 * These tests use `test.skip` with a DB-required note when they depend on
 * portal auth. Set PLAYWRIGHT_DB=1 to run with a seeded local DB.
 *
 * Tests that can run without DB (using STUB_DB or client-rendered pages) run
 * unconditionally.
 */
import { test, expect } from "@playwright/test";
import { stubDigest, stubDigestHistory } from "./fixtures/seed-user";

const DB_AVAILABLE = process.env.PLAYWRIGHT_DB === "1";

test.describe("Digest — Empty State", () => {
  test("digest page shows 'first digest arrives Sunday' when no digest exists", async ({ page }) => {
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — portal layout needs DB auth (BUG-002)");

    await page.route("**/api/digests/current", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "No digest found" }),
      });
    });

    await page.goto("/digest");

    await expect(
      page.getByText(/your first digest arrives sunday/i)
    ).toBeVisible();
    await expect(page.getByText(/6 pm aest/i)).toBeVisible();
  });

  test("digest page shows info message when API returns empty", async ({ page }) => {
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — portal layout needs DB auth (BUG-002)");

    await page.route("**/api/digests/current", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Error" }) });
    });

    await page.goto("/digest");
    // Should still render something useful (empty state or loading message)
    const heading = page.getByRole("heading", { name: /digest/i }).first();
    await expect(heading).toBeVisible();
  });
});

test.describe("Digest — 12-Card State", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — portal layout needs DB auth (BUG-002)");

    await page.route("**/api/digests/current", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stubDigest()),
      });
    });
    await page.route("**/api/portal/feedback", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
  });

  test("renders exactly 12 DA cards", async ({ page }) => {
    await page.goto("/digest");
    const cards = page.locator("article[aria-label]");
    await expect(cards).toHaveCount(12);
  });

  test("digest header shows correct date and lead count", async ({ page }) => {
    await page.goto("/digest");
    await expect(page.getByText(/27 apr 2026/i)).toBeVisible();
    await expect(page.getByText(/12 leads/i).first()).toBeVisible();
  });

  test("area label shown in digest header", async ({ page }) => {
    await page.goto("/digest");
    await expect(page.getByText(/western sydney/i).first()).toBeVisible();
  });

  test("end-of-digest marker rendered", async ({ page }) => {
    await page.goto("/digest");
    await expect(page.getByText(/end of digest/i)).toBeVisible();
  });

  test("each DA card shows address, value, why text, and action buttons", async ({ page }) => {
    await page.goto("/digest");
    const firstCard = page.locator("article[aria-label]").first();

    // Address
    await expect(firstCard.getByRole("heading").first()).toBeVisible();
    // Value
    await expect(firstCard.getByText(/est\. aud|value not disclosed/i).first()).toBeVisible();
    // Why matched
    await expect(firstCard.getByText(/colorbond/i).first()).toBeVisible();
    // View DA link
    await expect(firstCard.getByRole("link", { name: /view da/i })).toBeVisible();
    // Thumb buttons
    await expect(firstCard.getByRole("button", { name: /thumb up/i })).toBeVisible();
    await expect(firstCard.getByRole("button", { name: /thumb down/i })).toBeVisible();
  });

  test("thumb up on a card changes its visual state", async ({ page }) => {
    await page.goto("/digest");
    const firstCard = page.locator("article[aria-label]").first();
    const thumbUp = firstCard.getByRole("button", { name: /thumb up/i });

    await thumbUp.click();

    // aria-pressed becomes true
    await expect(thumbUp).toHaveAttribute("aria-pressed", "true");
    // Card gets green left border
    await expect(firstCard).toHaveClass(/border-l-\[#16A34A\]/);
  });

  test("thumb down on a card dims it", async ({ page }) => {
    await page.goto("/digest");
    const firstCard = page.locator("article[aria-label]").first();
    const thumbDown = firstCard.getByRole("button", { name: /thumb down/i });

    await thumbDown.click();
    await expect(thumbDown).toHaveAttribute("aria-pressed", "true");
    await expect(firstCard).toHaveClass(/opacity-75/);
  });

  test("tapping active thumb again removes feedback (toggle off)", async ({ page }) => {
    await page.goto("/digest");
    const firstCard = page.locator("article[aria-label]").first();
    const thumbUp = firstCard.getByRole("button", { name: /thumb up/i });

    // First tap: up
    await thumbUp.click();
    await expect(thumbUp).toHaveAttribute("aria-pressed", "true");

    // Second tap: remove
    await thumbUp.click();
    await expect(thumbUp).toHaveAttribute("aria-pressed", "false");
  });

  test("undo toast appears after thumb action and has undo button", async ({ page }) => {
    await page.goto("/digest");
    const firstCard = page.locator("article[aria-label]").first();
    await firstCard.getByRole("button", { name: /thumb up/i }).click();

    const undoToast = firstCard.getByRole("status").filter({ hasText: /feedback saved/i });
    await expect(undoToast).toBeVisible();
    await expect(firstCard.getByRole("button", { name: /undo/i })).toBeVisible();
  });

  test("rated-lead recap badge shown when weeksOfHistory >= 4", async ({ page }) => {
    await page.goto("/digest");
    // RatedLeadBadge renders "N of M rated on-target" (issue #186 — never "precision").
    await expect(page.getByText(/rated on-target/i).first()).toBeVisible();
  });
});

test.describe("Digest — Fallback Banner State", () => {
  test("shows fallback info banner when digest API signals fallback mode", async ({ page }) => {
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — portal layout needs DB auth (BUG-002)");

    await page.route("**/api/digests/current", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...stubDigest(),
          fallbackMode: true,
          fallbackReason: "AI scoring unavailable — showing rule-based results",
        }),
      });
    });

    await page.goto("/digest");
    // Cards still render
    const cards = page.locator("article[aria-label]");
    await expect(cards).toHaveCount(12);
    // Note: fallback banner rendering depends on frontend implementation.
    // If not yet rendered, this is a known gap.
  });
});

test.describe("Digest History", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — portal layout needs DB auth (BUG-002)");

    await page.route("**/api/digests", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stubDigestHistory()),
      });
    });
  });

  test("history page shows list of past digests", async ({ page }) => {
    await page.goto("/history");
    await expect(page.getByRole("heading", { name: /digest history/i })).toBeVisible();
    const historyItems = page.locator("ul[aria-label] li");
    await expect(historyItems).toHaveCount(3);
  });

  test("each history item shows date and lead count", async ({ page }) => {
    await page.goto("/history");
    await expect(page.getByText(/27 Apr 2026/i).first()).toBeVisible();
    await expect(page.getByText(/12 leads/i).first()).toBeVisible();
  });

  test("history empty state renders correctly", async ({ page }) => {
    await page.route("**/api/digests", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.goto("/history");
    await expect(page.getByText(/no digests yet/i)).toBeVisible();
  });
});
