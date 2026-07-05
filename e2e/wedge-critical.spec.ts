/**
 * wedge-critical.spec.ts
 *
 * The ONE critical user flow:
 *   landing → signup → OTP verify → LGA bundle pick (Western Sydney)
 *   → pricing → portal /digest renders the week's cards
 *   → tap thumb up on card 1 → undo toast appears → reload persists state
 *
 * Product truth (kept in sync with source, issue #96 C3):
 *   - Trial length is 28 days (src/lib/pricing.ts TRIAL_LENGTH_LABEL), not 14.
 *   - The onboarding LGA picker lives at /onboarding/area (the old duplicate
 *     /area route was removed).
 *   - OTP verification POSTs /api/auth/verify-email (there is no /api/auth/otp).
 *   - Team plan is gated off (single Solo plan) — there is no Team selection.
 *
 * The portal (/digest) is behind the portal layout, which calls
 * validateRequest() server-side (RSC); without a live DB it redirects to
 * /login and page.route() stubs can't intercept RSC server calls. So the
 * flow tests gate on PLAYWRIGHT_DB=1, exactly like digest.spec.ts.
 *
 * Viewport: 375×667 (chromium-mobile project) — wedge user is on iOS Mobile.
 */
import { test, expect } from "@playwright/test";
import { stubDigest } from "./fixtures/seed-user";

const TEST_OTP = "123456";
const DB_AVAILABLE = process.env.PLAYWRIGHT_DB === "1";

async function installCriticalStubs(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/signup", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ userId: "test-user-id", otpDispatched: true }),
      headers: { "Set-Cookie": "lucia_session=test-session; Path=/; HttpOnly; SameSite=Lax" },
    });
  });

  await page.route("**/api/auth/verify-email", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ verified: true }),
    });
  });

  await page.route("**/api/auth/verify-email/resend", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sent: true }) });
  });

  await page.route("**/api/account/lga-bundles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ bundle_ids: ["western_sydney"] }),
    });
  });

  await page.route("**/api/billing/checkout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ checkout_url: "http://localhost:3000/digest" }),
    });
  });

  // Feedback — persists state in a local Map so the reload check works.
  const feedbackStore = new Map<string, string>();
  await page.route("**/api/portal/feedback", async (route) => {
    const body = await route.request().postDataJSON().catch(() => ({}));
    if (body?.da_id) {
      if (body.feedback === "remove") {
        feedbackStore.delete(body.da_id);
      } else {
        feedbackStore.set(body.da_id, body.feedback);
      }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/api/digests/current", async (route) => {
    const digest = stubDigest();
    const das = digest.das.map((da) => ({
      ...da,
      initialFeedback: feedbackStore.get(da.id) ?? null,
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...digest, das }),
    });
  });
}

test.describe("Wedge Critical Flow", () => {
  test("landing → signup → OTP → LGA pick → pricing → digest cards → thumb up → undo → reload persists", async ({
    page,
  }) => {
    // The portal step needs a live DB (RSC validateRequest); gate the same way
    // digest.spec.ts does rather than skipping on a long-fixed route bug.
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — signup→portal flow needs live DB auth");
    await installCriticalStubs(page);

    // Step 1: Landing page renders CTA
    await page.goto("/");
    await expect(page.getByRole("link", { name: /start free trial/i }).first()).toBeVisible();

    // Step 2: Navigate to signup
    await page.getByRole("link", { name: /start free trial/i }).first().click();
    await page.waitForURL("**/signup");
    await expect(page.getByRole("heading", { name: /start your 28-day trial/i })).toBeVisible();

    // Fill signup form
    const testEmail = `test+wedge-${Date.now()}@example.com`;
    await page.fill("#email", testEmail);
    await page.fill("#password", "TestPassword123!");
    await page.fill("#mobile_e164", "400000001");
    await page.check("#acceptTerms");
    await page.click('button[type="submit"]');

    // Step 3: OTP verification page
    await page.waitForURL("**/verify");
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible({ timeout: 10_000 });
    for (let i = 0; i < 6; i++) {
      await page.fill(`#otp-${i}`, TEST_OTP[i]);
    }
    await expect(page.getByRole("button", { name: /verify email/i })).toBeEnabled();
    await page.click('button:has-text("Verify email")');

    // Step 4: LGA bundle selection at /onboarding/area
    await page.waitForURL("**/onboarding/area");
    await page.getByRole("button", { name: /western sydney/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 5: Pricing page — Solo pre-selected, 28-day trial CTA
    await page.waitForURL("**/plan");
    await expect(page.getByRole("heading", { name: /choose your plan/i })).toBeVisible();
    const soloCard = page.getByRole("radio", { name: /solo/i });
    await expect(soloCard).toHaveAttribute("aria-checked", "true");
    await page.click('button:has-text("Start 28-day trial")');

    // Step 6: Portal /digest renders the week's cards
    await page.waitForURL("**/digest");
    const daCards = page.locator("article[aria-label]");
    await expect(daCards.first()).toBeVisible();

    // Step 7: Tap thumb up on card 1
    const firstCard = daCards.first();
    await firstCard.getByRole("button", { name: /thumb up/i }).click();
    await expect(firstCard).toHaveClass(/border-l-\[#16A34A\]/);

    // Undo toast appears
    const undoToast = firstCard.getByRole("status").filter({ hasText: /feedback saved/i });
    await expect(undoToast).toBeVisible();
    await expect(firstCard.getByRole("button", { name: /undo/i })).toBeVisible();

    // Step 8: Reload — thumb-up state persists
    await page.reload();
    await page.waitForURL("**/digest");
    const firstCardAfterReload = page.locator("article[aria-label]").first();
    await expect(
      firstCardAfterReload.getByRole("button", { name: /thumb up/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("LGA bundle continue button is disabled until at least one bundle is selected", async ({ page }) => {
    // /onboarding/area is a post-signup step behind the auth flow; gate on DB.
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — onboarding step needs a live session");
    await page.goto("/onboarding/area");
    const continueBtn = page.getByRole("button", { name: /continue/i });
    await expect(continueBtn).toBeDisabled();

    await page.getByRole("button", { name: /western sydney/i }).click();
    await expect(continueBtn).toBeEnabled();
  });

  test("onboarding query step has a Back control that returns to area with the bundle still checked (issue #139)", async ({
    page,
  }) => {
    // Onboarding steps are client components with no RSC auth gate, so this
    // journey runs on stubs without PLAYWRIGHT_DB. A stateful store makes the
    // PUT-then-GET round-trip behave like the real API: the bundle saved on
    // "Continue" comes back checked when the user navigates Back.
    let savedBundles: string[] = [];
    await page.route("**/api/account/lga-bundles", async (route) => {
      const method = route.request().method();
      if (method === "PUT") {
        savedBundles = route.request().postDataJSON()?.bundle_ids ?? [];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ lgaBundles: savedBundles }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bundle_ids: savedBundles }),
      });
    });
    await page.route("**/api/account/saved-query", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ saved_query_text: null }),
      });
    });

    // The cookie-consent banner intercepts clicks on every page until dismissed.
    const dismissCookieBanner = async () => {
      const banner = page.locator('[role="dialog"][aria-label="Cookie consent"]');
      // It mounts a beat after navigation — wait for it before dismissing so we
      // don't race past an as-yet-unrendered banner that then intercepts clicks.
      await banner.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      const close = page.getByRole("button", {
        name: /close cookie banner|reject analytics cookies/i,
      });
      if (await close.count()) {
        await close.first().click();
        await banner.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
      }
    };

    // Step 3: pick a bundle and advance to the query step.
    await page.goto("/onboarding/area");
    await dismissCookieBanner();
    await page.getByRole("button", { name: /western sydney/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForURL("**/onboarding/query");

    // Step 4: a Back control is present…
    const back = page.getByRole("link", { name: /back to service area/i });
    await expect(back).toBeVisible();

    // …and activating it returns to the area step with the bundle still checked.
    await back.click();
    await page.waitForURL("**/onboarding/area");
    await expect(page.getByRole("button", { name: /western sydney/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("OTP verify button is disabled until all 6 digits are entered", async ({ page }) => {
    test.skip(!DB_AVAILABLE, "Requires PLAYWRIGHT_DB=1 — /verify needs a live session");
    await page.goto("/verify");
    const verifyBtn = page.getByRole("button", { name: /verify email/i });
    await expect(verifyBtn).toBeDisabled({ timeout: 10_000 });

    for (let i = 0; i < 5; i++) {
      await page.fill(`#otp-${i}`, "1");
    }
    await expect(verifyBtn).toBeDisabled();

    await page.fill("#otp-5", "2");
    await expect(verifyBtn).toBeEnabled();
  });
});
