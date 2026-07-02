-- Spam Act 2003 unsubscribe SLA: functional email opt-out flag.
-- Defaults true so existing subscribers keep receiving commercial email;
-- flipped false by the token-based /api/unsubscribe/[token] link.
ALTER TABLE "users" ADD COLUMN "email_opt_in" BOOLEAN NOT NULL DEFAULT true;
