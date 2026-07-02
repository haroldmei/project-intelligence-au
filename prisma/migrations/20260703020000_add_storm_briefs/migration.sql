-- Mid-week storm brief from BOM severe-weather warnings (issue #20,
-- docs/24 §4 August item 5). Flag-gated behind STORM_BRIEF_ENABLED until
-- dogfooded; this migration only lands the schema.

-- Per-user opt-out. Defaults true (opted-in) while the feature is globally
-- gated off; the /account toggle lets a user opt out ahead of the global
-- launch. The cron ANDs this with email_opt_in (Spam Act functional opt-out).
ALTER TABLE "users" ADD COLUMN "storm_brief_opt_in" BOOLEAN NOT NULL DEFAULT true;

-- Dedupe table: one row per (BOM warning, user) actually emailed. The unique
-- index guarantees at most one brief per user per warning id — the cron runs
-- every 3 hours and a warning stays live across several ticks, so without this
-- the same user would be re-emailed on every tick.
CREATE TABLE "storm_briefs" (
    "id" TEXT NOT NULL,
    "warning_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storm_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storm_briefs_warning_id_user_id_key" ON "storm_briefs"("warning_id", "user_id");

-- CreateIndex
CREATE INDEX "storm_briefs_user_id_idx" ON "storm_briefs"("user_id");

-- AddForeignKey
ALTER TABLE "storm_briefs" ADD CONSTRAINT "storm_briefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
