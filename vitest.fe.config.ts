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
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
