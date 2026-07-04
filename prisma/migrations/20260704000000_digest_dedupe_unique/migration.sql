-- issue #93: the weekly digest had no DB-level re-send protection, so two
-- overlapping cron invocations for the same week each read an empty priorDigests
-- set and emailed every subscriber twice, plus inserted duplicate DigestDa cards.
-- Dedup was purely application-level (non-atomic findFirst-then-create). This
-- migration moves the guarantee into the schema, mirroring the StormBrief pattern
-- (@@unique([warning_id, user_id]) with commit-before-send).

-- The old single-column index is subsumed by the composite unique below
-- (user_id is its leftmost prefix), so drop it to avoid a redundant index.
DROP INDEX "digests_user_id_idx";

-- At most one Digest row per (user, run). The loser of a concurrent create race
-- gets a unique violation (P2002) and backs off without sending.
CREATE UNIQUE INDEX "digests_user_id_run_id_key" ON "digests"("user_id", "run_id");

-- Stable per-week idempotency key on the run itself: two overlapping weekly
-- cron ticks compute the identical UTC-Sunday instant, so this unique constraint
-- makes them share ONE DigestRun instead of each creating a fresh one (which the
-- per-(user,run) Digest unique above could NOT prevent — the run ids differ).
-- Nullable + unique: ad-hoc preview runs leave it NULL and Postgres treats NULLs
-- as distinct, so any number of previews coexist. Existing rows keep NULL (not
-- backfilled) — the next weekly run is a fresh week with its own key.
ALTER TABLE "digest_runs" ADD COLUMN "week_key" TIMESTAMP(3);
CREATE UNIQUE INDEX "digest_runs_week_key_key" ON "digest_runs"("week_key");
