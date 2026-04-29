-- Adds (a) per-user plan + cancel-at-period-end flag, captured from Stripe
-- subscription webhooks so the portal can render real billing state, and
-- (b) a stripe_webhook_events table for cross-instance idempotency
-- (the previous in-memory Set was lost on every Vercel cold start).

ALTER TABLE "users"
  ADD COLUMN "plan" TEXT,
  ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);
