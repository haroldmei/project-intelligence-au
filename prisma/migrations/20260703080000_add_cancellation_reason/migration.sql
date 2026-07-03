-- Churn-signal capture for the in-product cancel dialog (issue #96 A5). The
-- DELETE /api/billing/subscription handler already accepted a `reason` but only
-- logged it; this column persists it so cancellations carry a "why" for
-- analytics. Nullable — pre-existing users and reason-less cancels stay NULL.
ALTER TABLE "users" ADD COLUMN "cancellation_reason" TEXT;
