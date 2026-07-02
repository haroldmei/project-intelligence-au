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
      "src/app/(marketing)/**/*.test.{ts,tsx}",
      "src/app/(auth)/**/*.test.{ts,tsx}",
      "src/app/(portal)/**/*.test.{ts,tsx}",
      "src/components/**/*.test.{ts,tsx}",
      // Vertical packs — pure logic + fully-mocked pipeline (no DB), so they run
      // in the always-on fe suite rather than the DB-gated backend suite.
      "src/verticals/**/*.test.{ts,tsx}",
      // Jurisdiction adapters (e.g. PlanSA) — pure mapping/paging logic with the
      // network layer mocked (no DB). Same rationale as vertical packs: run in
      // the always-on suite. They avoid `@/lib/env` (server-only, throws in
      // jsdom) by reading flags from process.env at call time.
      "src/modules/ingestion/jurisdictions/**/*.test.{ts,tsx}",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
