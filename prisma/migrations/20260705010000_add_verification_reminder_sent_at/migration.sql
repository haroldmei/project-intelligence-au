-- FR-016 verification-reminder dedupe (issue #130). An unverified signup gets
-- no Sunday digest (the digest cron gates on email_verified) and, before this
-- feature, no nudge to verify — a silent activation hole. The daily
-- verification-reminder cron sends one "verify your email to start receiving
-- your Sunday digest" message; this column stamps when it was sent so a
-- redelivery or timezone drift can't double-send. Nullable — existing rows and
-- never-reminded users stay NULL.
ALTER TABLE "users" ADD COLUMN "verification_reminder_sent_at" TIMESTAMP(3);
