// Playwright config for the deployed E2E lifecycle suite.
// Targets staging.pi-au.com by default (test-mode Stripe + sandbox DB).
// Override PROD_BASE_URL for ad-hoc runs against a Vercel preview URL or
// production. The pnpm scripts in package.json (test:billing:staging /
// test:billing:prod) wire the right values automatically.
import { defineConfig, devices } from "@playwright/test";

// Resolve target URL in priority order:
//   1. PROD_BASE_URL    — explicit override (CI, ad-hoc)
//   2. NEXT_PUBLIC_APP_URL — auto-loaded from .env.<env>.local via with-env.sh
//   3. staging.pi-au.com  — default for the safe-by-default test:billing:staging path
const PROD_BASE_URL =
  process.env.PROD_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://staging.pi-au.com";

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
