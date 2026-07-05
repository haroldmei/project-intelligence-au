import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Next's tsconfig sets "jsx": "preserve"; rolldown-vite honors it (esbuild-vite
  // ignored it), leaving JSX untransformed → parse failure. Force the transform here.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    name: "frontend",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.fe.setup.ts"],
    include: [
      // NOTE: Next route-group dirs contain literal parens, which fast-glob
      // treats as an extglob group — so an UNescaped "src/app/(portal)/**"
      // silently matches nothing. The (marketing)/(auth) globs below are left
      // unescaped to preserve main's behaviour (their pre-existing page tests
      // have bit-rotted against current copy and are out of scope for #20); the
      // (portal) glob is escaped so this feature's account/storm-brief page test
      // actually runs. Repairing + re-enabling the marketing/auth tests is
      // tracked separately.
      "src/app/(marketing)/**/*.test.{ts,tsx}",
      "src/app/(auth)/**/*.test.{ts,tsx}",
      // Escaped like the (portal) glob below so THIS feature's verify page test
      // actually runs (issue #92 — email display + change-email affordance).
      "src/app/\\(auth\\)/verify/**/*.test.{ts,tsx}",
      // Escaped so the signup page test runs (issue #88 — FR-022 SMS opt-in
      // disclosure, since SMS is opted-IN by default at signup).
      "src/app/\\(auth\\)/signup/**/*.test.{ts,tsx}",
      // Escaped so the onboarding area/query page tests run (issue #139 — Back
      // navigation + bundle pre-fill across the wizard steps).
      "src/app/\\(auth\\)/onboarding/**/*.test.{ts,tsx}",
      "src/app/\\(portal\\)/**/*.test.{ts,tsx}",
      "src/components/**/*.test.{ts,tsx}",
      // Transactional email templates (#14) — pure string builders, no DB / no
      // @/lib/env, so jsdom-safe and always-on. Covers the weekly-digest
      // lead-class badges + grouping.
      "src/emails/**/*.test.{ts,tsx}",
      // Vertical packs — pure logic + fully-mocked pipeline (no DB), so they run
      // in the always-on fe suite rather than the DB-gated backend suite.
      "src/verticals/**/*.test.{ts,tsx}",
      // Jurisdiction adapters (e.g. PlanSA) — pure mapping/paging logic with the
      // network layer mocked (no DB). Same rationale as vertical packs: run in
      // the always-on suite. They avoid `@/lib/env` (server-only, throws in
      // jsdom) by reading flags from process.env at call time.
      "src/modules/ingestion/jurisdictions/**/*.test.{ts,tsx}",
      // Storm-brief pure logic (#20) — feed parsing, LGA keyword matching, and
      // the send-selection/dedupe decision. No DB, no network, no @/lib/env, so
      // they run in the always-on suite. The DB-backed cron send is covered in
      // the backend suite (__tests__/weather/cron.test.ts).
      "src/modules/weather/**/*.test.{ts,tsx}",
      // Eval metrics/export/runner (#19) — pure precision/recall, dataset
      // dedupe, and prompt-building over an injected model caller. No DB, no
      // Anthropic, no @/lib/env. The DB-backed labelling logic is covered in the
      // backend suite (__tests__/evals/labelling.test.ts).
      "src/modules/evals/**/*.test.{ts,tsx}",
      // Pure lib modules with no DB / no @/lib/env (e.g. pricing, the single
      // source of truth for price + trial length). jsdom-safe, always-on.
      "src/lib/pricing.test.ts",
      // Client-side analytics init (#17) — consent gating for posthog-js. Reads
      // process.env.NEXT_PUBLIC_* directly (no @/lib/env), posthog-js mocked, so
      // jsdom-safe. The server helper is tested in the backend suite.
      "src/lib/analytics/browser.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
