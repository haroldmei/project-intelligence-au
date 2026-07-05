-- Issue #126: brute-force hardening for the password-reset confirm OTP.
-- The 6-digit reset code was verifiable with no failed-attempt ceiling, so an
-- attacker who knew a victim's email could hammer the live code inside its
-- 10-minute window and take over the account. This column counts wrong guesses
-- per OTP; verifyAndConsumeOtp burns the code once the count crosses the limit,
-- so one code can't be exhaustively tried even if a rate-limit window rolls
-- over. Defaults to 0 for existing and new rows.
ALTER TABLE "email_otps" ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;
