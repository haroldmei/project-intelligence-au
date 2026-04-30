// Environment variable schema — single source of truth for what env vars exist
// and what shape each one must have. Parsed once at import time.
//
// IMPORTANT: this module is SERVER-ONLY. Client components must read
// `process.env.NEXT_PUBLIC_*` directly (Next.js inlines those at build time).
// The runtime guard below throws if a client bundle imports this file.
//
// To add a new env var:
//   1. Add it to the schema below.
//   2. Add it to .env.production.example with a placeholder.
//   3. (If required for prod) the deploy preflight will fail until it's set.
//
// To use a value:
//   import { env } from "@/lib/env";
//   stripe.webhooks.constructEvent(payload, sig, env.STRIPE_WEBHOOK_SECRET);

import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error(
    "[env] @/lib/env is server-only. Client components should read process.env.NEXT_PUBLIC_* directly.",
  );
}

const baseShape = {
    // ── Runtime ──────────────────────────────────────────────────────────────
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Set by Vercel; unset locally. */
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),

    // ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: z.string().url(),

    // ── App URL (also exposed to client at build time) ──────────────────────
    NEXT_PUBLIC_APP_URL: z.string().url(),

    // ── AI providers ────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    USD_TO_AUD: z.coerce.number().positive().default(1.52),

    // ── Email (Resend). Optional in dev — `email/client.ts` no-ops without it.
    RESEND_API_KEY: z.string().min(1).optional(),

    // ── Billing (Stripe). Optional in dev; superRefine requires + format-checks in prod.
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_PRICE_ID_SOLO: z.string().min(1).optional(),
    STRIPE_PRICE_ID_TEAM: z.string().min(1).optional(),

    // ── SMS (Twilio). Optional — SMS digest fallback is silently skipped if unset.
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),

    // ── Auth/HMAC secrets ───────────────────────────────────────────────────
    FEEDBACK_HMAC_SECRET: z.string().min(8),
    CRON_SECRET: z.string().min(8),

    // ── Data sources ────────────────────────────────────────────────────────
    NSW_PLANNING_API_BASE: z.string().url().default("https://api.planningportal.nsw.gov.au/v1"),
    NSW_PLANNING_API_KEY: z.string().optional(),
    DA_LEADS_API_BASE: z.string().url().default("https://api.daleads.com.au/v1"),
    DA_LEADS_API_KEY: z.string().optional(),
    // DA Exhibitions HTML scrape (planningportal.nsw.gov.au/daexhibitions). When
    // "true", takes precedence over NSW Planning + DA Leads adapters for any
    // LGA in DAEX_LGA_VALUES. Default off so existing tests/code paths are
    // unchanged. Flip to "true" in Vercel env to enable in production.
    DAEX_INGEST_ENABLED: z.coerce.boolean().default(false),

    // ── Observability (optional Month 1) ────────────────────────────────────
    SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().default("https://us.i.posthog.com"),
} as const;

const Schema = z.object(baseShape).superRefine((data, ctx) => {
    // Production-only tightening: weak HMAC secrets are a security smell, but
    // we tolerate them in dev so local setup isn't onerous.
    const isProd = data.NODE_ENV === "production" || data.VERCEL_ENV === "production";
    if (!isProd) return;

    const requireProd = (
      key: keyof typeof data,
      pattern?: { regex: RegExp; reason: string },
    ) => {
      const v = data[key];
      if (v === undefined || v === "" || typeof v !== "string") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key as string],
          message: "required in production",
        });
        return;
      }
      if (pattern && !pattern.regex.test(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key as string],
          message: pattern.reason,
        });
      }
    };

    requireProd("RESEND_API_KEY");
    // Accept sk_live_ (real charges) or sk_test_ (end-to-end testing on prod
    // URL with test cards). Mismatches between key mode and price/webhook mode
    // surface as Stripe 400s, not as env errors. Test mode in prod is logged
    // loudly below so it can't slip into a real launch unnoticed.
    requireProd("STRIPE_SECRET_KEY", {
      regex: /^sk_(live|test)_/,
      reason: "must start with sk_live_ or sk_test_",
    });
    requireProd("STRIPE_WEBHOOK_SECRET", { regex: /^whsec_/, reason: "must start with whsec_" });
    requireProd("STRIPE_PRICE_ID_SOLO", { regex: /^price_/, reason: "must start with price_" });
    requireProd("STRIPE_PRICE_ID_TEAM", { regex: /^price_/, reason: "must start with price_" });

    if (data.FEEDBACK_HMAC_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FEEDBACK_HMAC_SECRET"],
        message: "must be ≥32 chars in production (generate: openssl rand -base64 32)",
      });
    }
    if (data.CRON_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CRON_SECRET"],
        message: "must be ≥32 chars in production (generate: openssl rand -base64 32)",
      });
    }
  });

// Coerce empty-string env values to undefined before parsing — distinguishes
// "key absent" from "key set to empty string" (the latter is what shells
// produce when you have `FOO=` in a .env file). Without this, optional Zod
// fields with `.min(1)` reject the empty value instead of treating it as unset.
const cleaned = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
);
const parsed = Schema.safeParse(cleaned);
if (!parsed.success) {
  console.error("[env] validation failed:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  throw new Error("Invalid environment variables — see errors above.");
}

export const env = parsed.data;
export type Env = typeof env;

// Loud warning if test-mode Stripe creds are running in a production env.
// Intentional during pre-launch end-to-end testing; should disappear before
// real customers can pay.
if (
  (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") &&
  env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
) {
  console.warn(
    "[env] STRIPE in TEST MODE on a production deploy — real cards will be rejected. " +
      "Switch to sk_live_ + live webhook + live price IDs before launch.",
  );
}

/**
 * Names of every var the schema knows about, with a `required` flag derived
 * from whether the underlying Zod type is optional. Used by scripts/check-env
 * to keep .env.production.example in sync with the schema.
 */
export const ENV_VARS: ReadonlyArray<{ name: string; required: boolean }> =
  Object.entries(baseShape).map(([name, type]) => ({
    name,
    required: !type.isOptional(),
  }));
