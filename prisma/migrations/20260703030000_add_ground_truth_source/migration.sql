-- Precision/recall labelling machinery for the gold set (issue #19,
-- docs/24 §4 August item 3 / G5). The DaGroundTruth table already existed but
-- was only ever touched by test setup; this makes it the store the labelling
-- CLI (scripts/label-das.ts) and thumb-import write to.

-- Label provenance: `manual` = human labelled in the interactive CLI; `thumb` =
-- imported from a DaFeedback thumbs-up/down as a candidate label pending review.
ALTER TABLE "da_ground_truth" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

-- One label per (DA, labeller). Enables multiple labellers per DA for
-- inter-rater agreement (Cohen's κ) and makes the CLI + thumb-import idempotent
-- (upsert on this key rather than piling up duplicate rows).
CREATE UNIQUE INDEX "da_ground_truth_da_id_labelled_by_key"
  ON "da_ground_truth" ("da_id", "labelled_by");
