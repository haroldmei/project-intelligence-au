-- Issue #89: SMS digest silently defaulted OFF for every new account despite
-- the signup/landing promise of "Email + SMS". Signup requires and collects a
-- verified AU mobile, and spec SF-3.4 / UX §7.9 mandate the toggle default ON,
-- so flip the column default to true. Only affects rows inserted from here on —
-- existing users keep whatever value they already have (no retroactive opt-in).
ALTER TABLE "users" ALTER COLUMN "sms_opt_in" SET DEFAULT true;
