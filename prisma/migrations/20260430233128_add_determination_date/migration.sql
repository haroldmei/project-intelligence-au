-- Stale-DA filter: a Determined DA from years ago is dead lead territory.
-- The DAEX adapter previously stamped lodgementDate=today as a fallback when
-- the detail page didn't expose exhibitionStart, which falsely made every
-- determined DA look fresh to downstream relevance. Capturing the actual
-- determination date lets the ingest pipeline drop records older than 180
-- days at write time instead of relying on a (broken) lodgementDate signal.

ALTER TABLE "development_applications"
  ADD COLUMN "determination_date" DATE;

-- Helps the freshness filter scan and any future "recently determined"
-- queries; same shape as the existing (council, lodgement_date) index.
CREATE INDEX "development_applications_council_determination_date_idx"
  ON "development_applications" ("council", "determination_date" DESC);
