-- Persist the portal's categorical "Type of development" per DA (issue #26,
-- expansion Wave 0). Until now the NSW DAEX adapter parsed this field only to
-- fold it into raw_scope_text; the expansion trade-pick (docs/25 §1.1) needs it
-- as a first-class column so demolition / pool / subdivision category-filterability
-- can be audited (scripts/audit-development-types.ts).
--
-- Nullable, no default: feeds that expose no category (NSW Planning API, DA Leads,
-- PlanSA) leave it null, exactly like estimated_value on value-less feeds. Existing
-- rows stay null until re-ingested — the audit reports that coverage explicitly.
ALTER TABLE "development_applications" ADD COLUMN "development_type" TEXT;
