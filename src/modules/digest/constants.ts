// Digest sizing constants — the single source of truth for how many cards
// each channel carries.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Issue #11: the email digest was capped at top-3 (commits de00449 / 431b080),
// which starves the per-user thumbs feedback moat — 3 cards/week can never
// reach the personalisation threshold in a useful timeframe. The wedge doc
// (docs/01c-wedge.md §1.5b) promises "5–15 curated leads" per digest, so the
// email is restored to that range. SMS stays top-3 to fit the ~320-char budget.

/** Hard ceiling on cards in the weekly email digest (wedge: "5–15 curated leads"). */
export const DIGEST_EMAIL_MAX_CARDS = 15;

/**
 * Target floor for the email digest. Not an enforced minimum — a genuinely
 * quiet week may surface fewer real leads and we never fabricate cards — but
 * the number the marketing framing and rerank are tuned around.
 */
export const DIGEST_EMAIL_MIN_CARDS = 5;

/** SMS digest stays top-3 to stay within the 2-part (~320 char) budget. */
export const DIGEST_SMS_MAX_CARDS = 3;
