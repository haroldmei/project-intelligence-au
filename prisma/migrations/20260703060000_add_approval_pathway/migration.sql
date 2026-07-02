-- NSW CDC (Complying Development Certificate) ingestion (issue #10, docs/24 G1).
--
-- Most NSW re-roofing work never generates a DA: like-for-like re-roofs are
-- exempt development (no lodgement), while material-change re-roofs (tile→metal)
-- go through the CDC pathway, published in the Online CDC Data API. We now ingest
-- CDC records alongside DAs, so every development_applications row carries which
-- pathway it arrived on.
--
-- da  — Development Application (all pre-#10 rows; the default).
-- cdc — Complying Development Certificate (the re-roof pathway).
-- ssd — State Significant Development (dormant Teams-tier feed).
--
-- Defaulting 'da' backfills every existing row in place, so NSW DA output stays
-- byte-identical.
ALTER TABLE "development_applications" ADD COLUMN "approval_pathway" TEXT NOT NULL DEFAULT 'da';

-- IngestionLog rows are now written per (council, pathway) so the drift alert can
-- distinguish a DA-feed drop from a CDC-feed drop instead of averaging both
-- together. Historical rows predate CDC ingestion and are all DA-pathway.
ALTER TABLE "ingestion_log" ADD COLUMN "approval_pathway" TEXT NOT NULL DEFAULT 'da';
