-- Parameterise the rerank gold set by (vertical, jurisdiction) (issue #31,
-- docs/25 §4 item 4). A DaGroundTruth label is scoped to the trade + region it
-- was made under, so every future (trade, region) launch inherits the same GA
-- gate (precision ≥ 0.7 / recall ≥ 0.6) rather than re-inventing it.

-- Every existing label is the roofing/NSW wedge, so `DEFAULT` on a NOT NULL
-- column backfills them in place at ALTER time — roofing/NSW output stays
-- unchanged and no separate backfill UPDATE is needed (same pattern as the
-- 20260702010000_add_jurisdiction migration on development_applications).
ALTER TABLE "da_ground_truth" ADD COLUMN "vertical" TEXT NOT NULL DEFAULT 'roofing';
ALTER TABLE "da_ground_truth" ADD COLUMN "jurisdiction" TEXT NOT NULL DEFAULT 'nsw';
