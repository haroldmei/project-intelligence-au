-- Waitlist demand instrument (issue #25, expansion Wave 0 — docs/25 §2).
-- Captures out-of-scope (trade, region) demand from the landing page and the
-- signup funnel BEFORE any expansion is built. No confirmation email in v1
-- (avoids Spam Act 2003 commercial-message surface); this table stores intent
-- only.
--
-- email is CITEXT so dedupe is case-insensitive at the DB layer (the citext
-- extension is already installed by the init migration). The unique index on
-- (email, trade, region) makes repeat submissions idempotent — a re-submit is
-- an upsert no-op. The route additionally lowercases trade/region before insert
-- so "Roofing" and "roofing" collapse to one row.
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_email_trade_region_key" ON "waitlist_entries"("email", "trade", "region");

-- CreateIndex
CREATE INDEX "waitlist_entries_created_at_idx" ON "waitlist_entries"("created_at");
