import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
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
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
