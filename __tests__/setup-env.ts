// Env defaults for backend tests.
// Loaded via vitest's setupFiles before any module body runs, so env.ts sees
// these values when it parses on first import. Shell-set values win (??=).

process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.FEEDBACK_HMAC_SECRET ??= "0123456789abcdef0123456789abcdef";
process.env.CRON_SECRET ??= "0123456789abcdef0123456789abcdef";
process.env.ANTHROPIC_API_KEY ??= "test";
process.env.OPENAI_API_KEY ??= "test";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_lifecycle_32chars_xxxxxxxxxxxxxxxx";
process.env.STRIPE_SECRET_KEY ??= "sk_test_lifecycle";
process.env.STRIPE_PRICE_ID_SOLO ??= "price_test_solo";
process.env.STRIPE_PRICE_ID_TEAM ??= "price_test_team";
process.env.RESEND_API_KEY ??= "";
