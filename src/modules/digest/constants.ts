// Digest sizing constants — the single source of truth for how many cards
// each channel carries.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Issue #11: the email digest was capped at top-3 (commits de00449 / 431b080),
// which starves the per-user thumbs feedback moat — 3 cards/week can never
// reach the personalisation threshold in a useful timeframe. The wedge doc
// (docs/01c-wedge.md §1.5b) promises "5–15 curated leads" per digest, so the
// email is restored to that range. SMS stays top-3 to fit FR-011's 3-part
// (≤ 480-char) budget.

/** Hard ceiling on cards in the weekly email digest (wedge: "5–15 curated leads"). */
export const DIGEST_EMAIL_MAX_CARDS = 15;

/**
 * FR-006 minimum for a real (non-quiet) digest. A digest contains 5–15 DAs that
 * clear the relevance floor (relevance_score ≥ 4); if fewer than this many clear
 * it, the run is a quiet week and sends the FR-010 reassurance email instead of
 * padding with borderline leads (enforced in modules/relevance/run.ts, issue
 * #163). We still never fabricate cards — a quiet week ships zero, not filler.
 */
export const DIGEST_EMAIL_MIN_CARDS = 5;

/** SMS digest stays top-3 to stay within FR-011's 3-part (≤ 480 char) budget. */
export const DIGEST_SMS_MAX_CARDS = 3;
