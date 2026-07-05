// Production E2E — drives the live deployment through every subscription
// state a paying user can land in. No real email, no OTP step (the signup
// route auto-verifies @e2e.test.pi-au.com when Stripe is in test mode).
//
// Run:
//   PROD_BASE_URL=https://www.pi-au.com \
//   STRIPE_TEST_SECRET_KEY=sk_test_… \
//   pnpm exec playwright test -c playwright.prod.config.ts
//
// Each test creates a fresh user, drives it through some subset of the
// lifecycle, and deletes it via /api/account/delete (which also cancels
// the Stripe subscription) so prod stays tidy.

import { test, expect, type Page } from "@playwright/test";

// ─── Constants ───────────────────────────────────────────────────────────────

const STRIPE_TEST_KEY = process.env.STRIPE_TEST_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_API = "https://api.stripe.com/v1";

const TEST_CARD = {
  number: "4242 4242 4242 4242",
  expiry: "12 / 35",
  cvc: "123",
  postcode: "2000",
};

const E2E_DOMAIN = "@e2e.test.pi-au.com";
const PASSWORD = "TestPassword123!";

function uniqueEmail(slug: string): string {
  return `e2e-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${E2E_DOMAIN}`;
}

// ─── Stripe REST helpers (test-mode only) ───────────────────────────────────

async function stripeForm(path: string, params: Record<string, string>): Promise<Response> {
  if (!STRIPE_TEST_KEY.startsWith("sk_test_")) {
    throw new Error("STRIPE_TEST_SECRET_KEY must be a sk_test_ key for prod E2E");
  }
  const auth = Buffer.from(`${STRIPE_TEST_KEY}:`).toString("base64");
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${await res.text()}`);
  return res;
}

async function stripeGet(path: string): Promise<unknown> {
  const auth = Buffer.from(`${STRIPE_TEST_KEY}:`).toString("base64");
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getActiveSubscriptionId(customerId: string): Promise<string | null> {
  const data = (await stripeGet(
    `/subscriptions?customer=${encodeURIComponent(customerId)}&limit=10&status=all`,
  )) as { data: Array<{ id: string; status: string }> };
  const live = data.data.find((s) => s.status === "trialing" || s.status === "active");
  return live?.id ?? null;
}

// ─── App fixture: signup + onboarding ───────────────────────────────────────

interface _E2EUser {
  email: string;
  page: Page;
}

async function dismissCookieBanner(page: Page): Promise<void> {
  // Cookie banner intercepts clicks on every page until dismissed.
  const close = page.getByRole("button", { name: /close cookie banner|reject analytics cookies/i });
  if (await close.count()) {
    await close.first().click();
    await page.locator('[role="dialog"][aria-label="Cookie consent"]').waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  }
}

async function signupAutoVerified(page: Page, slug: string): Promise<string> {
  const email = uniqueEmail(slug);
  await page.goto("/signup");
  await dismissCookieBanner(page);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#mobile_e164", "400000000");
  await page.check("#acceptTerms");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding/area", { timeout: 30_000 });
  await dismissCookieBanner(page);
  return email;
}

async function completeOnboardingArea(page: Page): Promise<void> {
  await dismissCookieBanner(page);
  // Step 3 — pick the first LGA bundle and continue.
  await page.getByRole("button", { name: /western sydney/i }).first().click();
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Step 4 — saved-query capture. Use the default to keep the test
  // deterministic (and to exercise the default-fill path).
  await page.waitForURL("**/onboarding/query", { timeout: 30_000 });
  await dismissCookieBanner(page);
  await page.getByRole("button", { name: /use the default/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Step 5 — plan picker.
  await page.waitForURL("**/plan", { timeout: 30_000 });
  await dismissCookieBanner(page);
}

async function fetchAccountMe(page: Page): Promise<Record<string, unknown>> {
  const res = await page.request.get("/api/account/me");
  expect(res.status()).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

async function pollUntilAccessUntilSet(page: Page, timeoutMs = 60_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const me = await fetchAccountMe(page);
    if (typeof me.accessUntil === "string" && me.accessUntil.length > 0) {
      return me.accessUntil;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error("Timed out waiting for accessUntil to populate (webhook didn't land)");
}

async function pollUntilStatus(
  page: Page,
  predicate: (me: Record<string, unknown>) => boolean,
  timeoutMs = 60_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    last = await fetchAccountMe(page);
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Timed out waiting for predicate. Last me=${JSON.stringify(last)}`);
}

async function fillStripeCheckoutAndPay(page: Page): Promise<void> {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");

  // Stripe's payment-method radios are inside <label> wrappers that own the
  // click handler. Targeting the radio input directly with .click() doesn't
  // always trigger the wrapper's React onChange. Find the label by its
  // accessible name and click the wrapper instead.
  const cardLabel = page.locator("label").filter({ has: page.getByRole("radio", { name: /^card$/i }) });
  if (await cardLabel.count()) {
    await cardLabel.first().click();
  } else {
    // Older UI: radio is the click target.
    await page.getByRole("radio", { name: /^card$/i }).click({ force: true });
  }
  const cardNumberLocator = page.locator('input[autocomplete="cc-number"]');
  await cardNumberLocator.first().waitFor({ state: "visible", timeout: 15_000 });

  await page.locator('input[autocomplete="cc-number"]').first().fill(TEST_CARD.number);
  await page.locator('input[autocomplete="cc-exp"]').first().fill(TEST_CARD.expiry);
  await page.locator('input[autocomplete="cc-csc"]').first().fill(TEST_CARD.cvc);

  const nameInput = page.locator('input[autocomplete="cc-name"]');
  if (await nameInput.count()) await nameInput.first().fill("E2E Tester");

  const postcodeInput = page.locator('input[autocomplete="postal-code"]');
  if (await postcodeInput.count()) await postcodeInput.first().fill(TEST_CARD.postcode);

  // Uncheck Stripe Link "save my info" so we don't have to fill the phone field.
  const saveInfo = page.getByRole("checkbox", { name: /save my information/i });
  if ((await saveInfo.count()) && (await saveInfo.first().isChecked().catch(() => false))) {
    await saveInfo.first().uncheck({ force: true }).catch(() => {});
  }

  // Submit. Stripe's button is labelled "Start trial" / "Subscribe" depending
  // on the session config; the data-testid is stable across both.
  const submit = page.locator('button[data-testid="hosted-payment-submit-button"]');
  await submit.first().waitFor({ state: "visible" });
  await expect(submit.first()).toBeEnabled({ timeout: 5_000 });
  await submit.first().click();
  // If the click missed (Stripe sometimes briefly disables and re-enables the
  // button while validating), the page stays interactive. Click again after
  // a short wait if the button is still enabled — submitted ones go disabled.
  await page.waitForTimeout(2_000);
  if (await submit.first().isEnabled().catch(() => false)) {
    await submit.first().click().catch(() => {});
  }

  // Stripe Checkout in test mode can sit on the loading state for 20–60s
  // before redirecting. Allow a generous window.
  await page.waitForURL(/pi-au\.com\/account/, { timeout: 120_000 });
}

async function tryDeleteAccount(page: Page): Promise<void> {
  // Best-effort cleanup; ignore failures (test may have already cleared session).
  try {
    await page.request.delete("/api/account/delete");
  } catch {
    /* ignore */
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe("Subscription lifecycle (production E2E)", () => {
  test.skip(
    !STRIPE_TEST_KEY.startsWith("sk_test_"),
    "STRIPE_TEST_SECRET_KEY must be a sk_test_ key — set it in env to run prod E2E",
  );

  // ── Stage 1: signup auto-verify lands on /onboarding/area ────────────────
  test("Stage 1 — signup auto-verifies and skips /verify", async ({ page }) => {
    const email = await signupAutoVerified(page, "stage1");
    expect(page.url()).toContain("/onboarding/area");

    const me = await fetchAccountMe(page);
    expect(me.email).toBe(email);
    expect(me.emailVerified).toBe(true);
    expect(me.subscriptionStatus).toBe("trial");
    expect(me.accessUntil).toBeNull();
    expect(me.cancelAtPeriodEnd).toBe(false);

    await tryDeleteAccount(page);
  });

  // ── Stage 2: pre-Checkout /account UI ────────────────────────────────────
  test("Stage 2 — pre-Checkout /account shows 'Choose a plan', no Cancel button", async ({ page }) => {
    await signupAutoVerified(page, "stage2");
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: /account/i })).toBeVisible();
    // Pre-Checkout user sees the CTA, not the Cancel button — guards the bug
    // we just shipped a fix for.
    await expect(page.getByRole("link", { name: /choose a plan/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^cancel subscription$/i })).toHaveCount(0);
    await expect(page.getByText(/manage billing/i)).toHaveCount(0);

    await tryDeleteAccount(page);
  });

  // ── Stage 2b: post-Checkout return before the webhook lands (#133) ───────
  // A just-paid user is redirected to /account?billing=success, but the
  // customer.subscription.created webhook that populates accessUntil is async.
  // A fresh signed-up user (subscriptionStatus=trial, accessUntil=null) is a
  // faithful stand-in for that pre-webhook state, so we can assert the race
  // deterministically without having to catch the real webhook mid-flight.
  test("Stage 2b — ?billing=success with accessUntil still null shows an activating confirmation, not 'Trial not started'", async ({ page }) => {
    await signupAutoVerified(page, "stage2b");

    // Precondition: this is exactly the pre-webhook state the bug reproduces in.
    const me = await fetchAccountMe(page);
    expect(me.subscriptionStatus).toBe("trial");
    expect(me.accessUntil).toBeNull();

    await page.goto("/account?billing=success");
    await expect(page.getByRole("heading", { name: /account/i })).toBeVisible();

    // Explicit checkout-success confirmation is shown…
    await expect(page.getByText(/payment received/i)).toBeVisible();
    // …and the account reads as provisioning, NOT the pre-checkout dead-end.
    await expect(page.getByText(/activating your trial/i)).toBeVisible();
    await expect(page.getByText(/trial not started/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /choose a plan/i })).toHaveCount(0);

    await tryDeleteAccount(page);
  });

  // ── Stage 3: full Checkout → trial-active state ──────────────────────────
  test("Stage 3 — Checkout completes, /account shows trial-active state", async ({ page }) => {
    await signupAutoVerified(page, "stage3");
    await completeOnboardingArea(page);
    // Pick Solo and start the trial
    await page.getByRole("radio", { name: /solo/i }).click();
    await page.getByRole("button", { name: /start.*trial/i }).click();
    await fillStripeCheckoutAndPay(page);

    // Wait for the webhook to land (accessUntil populated by subscription.created)
    const accessUntil = await pollUntilAccessUntilSet(page);
    const me = await fetchAccountMe(page);
    expect(me.subscriptionStatus).toBe("trial");
    expect(me.cancelAtPeriodEnd).toBe(false);
    expect(me.plan).toBe("solo");
    expect(typeof accessUntil).toBe("string");

    // UI assertions
    await page.goto("/account");
    await expect(page.getByText(/trial ends/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel subscription/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /manage billing/i })).toBeVisible();

    await tryDeleteAccount(page);
  });

  // ── Stage 4: cancel during trial → pending-cancellation ──────────────────
  test("Stage 4 — cancel during trial → pending-cancellation state", async ({ page }) => {
    await signupAutoVerified(page, "stage4");
    await completeOnboardingArea(page);
    await page.getByRole("radio", { name: /solo/i }).click();
    await page.getByRole("button", { name: /start.*trial/i }).click();
    await fillStripeCheckoutAndPay(page);
    await pollUntilAccessUntilSet(page);

    await page.goto("/account");
    await page.getByRole("button", { name: /cancel subscription/i }).click();
    // Confirm in the dialog (the dialog's confirm button is also "Cancel subscription")
    const dialog = page.getByRole("dialog", { name: /cancel your subscription/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel subscription/i }).click();

    // Webhook for cancel_at_period_end=true should land within seconds
    await pollUntilStatus(page, (me) => me.cancelAtPeriodEnd === true);
    await page.reload();
    await expect(page.getByText(/cancellation scheduled/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^cancel subscription$/i })).toHaveCount(0);

    await tryDeleteAccount(page);
  });

  // ── Stage 5: portal redirect ─────────────────────────────────────────────
  test("Stage 5 — Manage billing redirects to billing.stripe.com", async ({ page }) => {
    await signupAutoVerified(page, "stage5");
    await completeOnboardingArea(page);
    await page.getByRole("radio", { name: /solo/i }).click();
    await page.getByRole("button", { name: /start.*trial/i }).click();
    await fillStripeCheckoutAndPay(page);
    await pollUntilAccessUntilSet(page);

    await page.goto("/account");
    // Hit the portal API directly to capture the redirect URL — clicking the
    // button races against the navigation and Chrome may discard the response
    // body before we can read it.
    const portalResp = await page.request.post("/api/billing/portal");
    expect(portalResp.status()).toBe(200);
    const json = (await portalResp.json()) as { portal_url?: string };
    expect(json.portal_url).toContain("billing.stripe.com");

    // Sanity check: clicking the button actually navigates the page.
    await page.getByRole("button", { name: /manage billing/i }).click();
    await page.waitForURL(/billing\.stripe\.com|stripe\.com/, { timeout: 30_000 });

    await tryDeleteAccount(page);
  });

  // ── Stage 6: Stripe-side cancellation → cancelled state + Resubscribe ───
  test("Stage 6 — final cancellation surfaces Resubscribe button", async ({ page }) => {
    await signupAutoVerified(page, "stage6");
    await completeOnboardingArea(page);
    await page.getByRole("radio", { name: /solo/i }).click();
    await page.getByRole("button", { name: /start.*trial/i }).click();
    await fillStripeCheckoutAndPay(page);
    const me1 = await pollUntilStatus(page, (me) => me.accessUntil !== null);
    const customerId = (me1 as { stripeCustomerId?: string }).stripeCustomerId
      ?? (await fetchAccountMe(page)).stripeCustomerId;
    // The DTO doesn't expose stripeCustomerId — query Stripe by listing customers
    // for this email (a tighter coupling, but acceptable for a test).
    const customersList = (await stripeGet(
      `/customers?email=${encodeURIComponent(me1.email as string)}&limit=1`,
    )) as { data: Array<{ id: string }> };
    const cusId = customersList.data[0]?.id ?? customerId;
    expect(cusId, "Stripe customer for the test user must exist").toBeTruthy();

    const subId = await getActiveSubscriptionId(cusId as string);
    expect(subId, "Active subscription must exist before cancel").toBeTruthy();

    // Hard-cancel via Stripe API → fires customer.subscription.deleted
    await stripeForm(`/subscriptions/${subId}`, { cancel_at_period_end: "false" });
    await fetch(`${STRIPE_API}/subscriptions/${subId}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${Buffer.from(`${STRIPE_TEST_KEY}:`).toString("base64")}` },
    });

    await pollUntilStatus(page, (me) => me.subscriptionStatus === "cancelled");
    await page.goto("/account");
    await expect(page.getByText(/subscription cancelled/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /resubscribe/i })).toBeVisible();

    await tryDeleteAccount(page);
  });

  // ── Stage 7: resubscribe (no trial second time) ─────────────────────────
  test("Stage 7 — resubscribe goes through Checkout without a trial", async ({ page }) => {
    await signupAutoVerified(page, "stage7");
    await completeOnboardingArea(page);
    await page.getByRole("radio", { name: /solo/i }).click();
    await page.getByRole("button", { name: /start.*trial/i }).click();
    await fillStripeCheckoutAndPay(page);
    const me1 = await pollUntilStatus(page, (me) => me.accessUntil !== null);
    const customersList = (await stripeGet(
      `/customers?email=${encodeURIComponent(me1.email as string)}&limit=1`,
    )) as { data: Array<{ id: string }> };
    const cusId = customersList.data[0]!.id;
    const subId = await getActiveSubscriptionId(cusId);
    await fetch(`${STRIPE_API}/subscriptions/${subId}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${Buffer.from(`${STRIPE_TEST_KEY}:`).toString("base64")}` },
    });
    await pollUntilStatus(page, (me) => me.subscriptionStatus === "cancelled");

    await page.goto("/account");
    await page.getByRole("button", { name: /resubscribe/i }).click();
    await fillStripeCheckoutAndPay(page);
    // Resubscribe path = withTrial=false → status flips straight to active
    await pollUntilStatus(page, (me) => me.subscriptionStatus === "active");

    await tryDeleteAccount(page);
  });
});
