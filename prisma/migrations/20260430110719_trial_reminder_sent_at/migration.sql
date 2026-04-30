-- H3: dedupe the day-26 trial reminder. Without this column the cron's
-- date-window query could send twice when DST shifts the boundary or
-- when a deploy retriggers the function within the day.

ALTER TABLE "users"
  ADD COLUMN "trial_reminder_sent_at" TIMESTAMP(3);
