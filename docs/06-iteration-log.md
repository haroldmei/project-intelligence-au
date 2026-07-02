# Iteration Log

> One-line per iteration. Format: `- [YYYY-MM-DD] iter-N: <verdict> — <one-line summary>`

- [2026-04-29] iter-0: SHIPPED-LOCAL — preview-tier build complete; dogfood health 8.4 → POLISH round → 5/5 polish items shipped; commit `de593ff` tagged `v0.1.0-preview-ready`; deploy hand-off owned by user (DB + 12 env vars + `vercel link && vercel --prod`).
- [2026-07-02] iter-1: SHIPPED-LOCAL (issue #23) — Spam Act unsubscribe SLA: sender-id + STOP footer centralised in `src/lib/sms/client.ts` (`applyComplianceWrapping`, enforced in `sendSms` — unbypassable); digest re-checks `smsOptIn`/`emailOptIn` from DB at send time so a mid-run STOP/unsubscribe suppresses that user's send; new token-based unauthenticated `GET /api/unsubscribe/[token]` (no login/fee) flips `User.emailOptIn`, gated in digest + trial-reminder crons; real-handler STOP webhook test + 18 new tests. typecheck/lint/unit green.
