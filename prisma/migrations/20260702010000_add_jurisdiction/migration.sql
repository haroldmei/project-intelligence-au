-- Formalise the multi-jurisdiction ingestion seam (issue #28): stamp every
-- development application and LGA reference row with the statewide jurisdiction
-- it belongs to. Every existing row is NSW, so `DEFAULT 'nsw'` on a NOT NULL
-- column backfills them in place at ALTER time — NSW output stays byte-identical
-- and no separate backfill UPDATE is needed.
ALTER TABLE "development_applications" ADD COLUMN "jurisdiction" TEXT NOT NULL DEFAULT 'nsw';
ALTER TABLE "lgas" ADD COLUMN "jurisdiction" TEXT NOT NULL DEFAULT 'nsw';
