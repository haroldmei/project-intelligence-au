// Vitest config for adversarial test suite.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// Pure unit tests — no DB or live network required.
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "adversarial",
    environment: "node",
    globals: true,
    pool: "forks",
    fileParallelism: true,
    include: ["tests/adversarial/**/*.test.ts"],
    // No coverage gates — these tests INTEND to find bugs; coverage is in
    // backend / fe configs.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
