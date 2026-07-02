import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      ".codex/**",
      ".gemini/**",
      ".claude/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Playwright fixtures receive a `use` callback — not a React hook.
    files: ["e2e/**", "tests/**", "playwright*.config.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // react-email templates render a full HTML document, <head> included.
    files: ["src/emails/**"],
    rules: {
      "@next/next/no-head-element": "off",
    },
  },
];

export default eslintConfig;
