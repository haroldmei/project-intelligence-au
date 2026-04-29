// Playwright config for production E2E tests against the live deployment.
// Does NOT start a local dev server — points at the deployed Vercel URL.
import { defineConfig, devices } from "@playwright/test";

const PROD_BASE_URL = process.env.PROD_BASE_URL ?? "https://www.pi-au.com";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /billing-lifecycle-prod\.spec\.ts$/,
  // Stripe Checkout pages can be slow + retry-friendly.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Stripe Checkout in test mode occasionally takes >1m to redirect; retry once.
  retries: process.env.CI ? 2 : 1,
  // Each test creates a real user against prod — keep workers serial so we
  // don't pummel Stripe with parallel customer creates.
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-prod-report" }],
    ["list"],
  ],
  use: {
    baseURL: PROD_BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  outputDir: "test-results-prod",
});
