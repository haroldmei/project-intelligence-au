-- Honest lead class per digested DA (issue #14). Every surfaced lead is sorted
-- into one of three classes the DA/CDC data genuinely supports —
-- builder_pipeline | fast_track | strata_heritage — computed deterministically
-- at assembly time (src/modules/relevance/lead-class.ts) and stored here so a
-- digest's classification is stable history even as the classifier rules evolve.
--
-- NOT NULL with a default of the ambiguous fallback ('builder_pipeline') so
-- pre-existing digest_das rows backfill in place, exactly like the jurisdiction
-- backfill on development_applications.
ALTER TABLE "digest_das" ADD COLUMN "lead_class" TEXT NOT NULL DEFAULT 'builder_pipeline';
