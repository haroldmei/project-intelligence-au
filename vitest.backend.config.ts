// Vitest config for backend integration tests.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// Requires TEST_DATABASE_URL pointing to a dedicated test Postgres DB.
// NFR-024: 80% line coverage gate on each module's exported functions.
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "backend",
    environment: "node",
    globals: true,
    // Integration tests run sequentially to avoid DB race conditions (Vitest 4: poolOptions removed)
    pool: "forks",
    fileParallelism: false,
    include: ["__tests__/**/*.test.ts"],
    setupFiles: ["__tests__/setup-env.ts"],
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
      include: [
        "src/modules/**/*.ts",
        "src/lib/hmac/**/*.ts",
        "src/lib/cron/**/*.ts",
        "src/lib/sms/**/*.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
