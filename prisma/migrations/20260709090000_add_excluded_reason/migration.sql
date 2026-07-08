-- Issue #221: distinguish rule-pass false negatives from refused/withdrawn
-- status exclusions on development_applications.ruleFilteredOut.
--
-- FR-004's fourth acceptance criterion requires DAs that FAIL the roofing rule
-- pass to be persisted with rule_filtered_out=true 'for recall audit purposes'.
-- Before this migration the ONLY writer of true was the refused-DA backfill
-- (scripts/cleanup-refused-das.ts), so the eval harness's 'misses' stratum
-- sampled refused DAs, not rule-pass false negatives.
--
-- This migration adds excluded_reason so the two meanings are unambiguous:
--   null               — not excluded (ruleFilteredOut = false)
--   'rule_filter_miss' — failed the roofing keyword rule pass
--   'refused_withdrawn' — determined Refused/Withdrawn (status exclusion)
--
-- Existing ruleFilteredOut = true rows are backfilled to 'refused_withdrawn'
-- since they came from the cleanup script, keeping the production eval sample
-- honest until the next ingest tick populates 'rule_filter_miss' entries.
ALTER TABLE "development_applications" ADD COLUMN "excluded_reason" TEXT;

-- Backfill: every row that was already excluded is a refused/withdrawn DA from
-- the old cleanup script (the only writer of true before this fix).
UPDATE "development_applications" SET "excluded_reason" = 'refused_withdrawn' WHERE "rule_filtered_out" = true;
