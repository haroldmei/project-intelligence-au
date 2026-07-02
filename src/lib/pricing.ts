// Single source of truth for ProjectIntelligence pricing.
//
// Everything user-facing — the landing page, the /plan picker, the account
// page, email templates, and Stripe checkout metadata — imports from here.
// There are NO other literal price strings in src/. If the price moves, it
// moves here and nowhere else.
//
// Repriced 2026-07 down to AUD 99 inc GST on competitive banding — DA Leads at
// AUD 49/mo, SiteLens at £29/mo; see docs/24 §2.2 and the changelog in
// docs/16-pricing.md for the prior price and rationale.
//
// Multi-seat (the former "Team" tier) is deferred until the multi-seat flow
// ships — there is intentionally only one plan here.
//
// Pure module, zero imports: safe in server components, client components,
// email templates, and jsdom tests alike.

/** Australian GST rate (10%). */
export const GST_RATE = 0.1;

/** The canonical pricing facts. Everything else is derived from these. */
export const PRICING = {
  /** Plan name shown to users. Multi-seat ("Team") is deferred until it ships. */
  planName: "Solo",
  /** ISO 4217 currency code. */
  currency: "AUD",
  /** Headline monthly price in cents. GST-INCLUSIVE (see gstInclusive). */
  priceCents: 9900,
  /** The headline price already includes GST — nothing is added at checkout. */
  gstInclusive: true,
  /** Full-access free trial length, in days. */
  trialDays: 28,
} as const;

/** Headline price in whole dollars (99). */
export const priceDollars = PRICING.priceCents / 100;

/**
 * GST component of the GST-inclusive headline price, in cents.
 * inc-GST: gst = total − total / (1 + rate) = 9900 − 9000 = 900 → AUD 9.
 */
export const gstComponentCents = Math.round(
  PRICING.priceCents - PRICING.priceCents / (1 + GST_RATE),
);
/** GST component in whole dollars (9). */
export const gstComponentDollars = gstComponentCents / 100;

// ── Formatted display strings — the only place price copy is spelled out ──

/** "AUD 99" */
export const PRICE_AMOUNT = `${PRICING.currency} ${priceDollars}`;
/** "AUD 99/mo" */
export const PRICE_MONTHLY = `${PRICE_AMOUNT}/mo`;
/** "GST included" (inc-GST) or "+ GST" (ex-GST). */
export const GST_SUFFIX = PRICING.gstInclusive ? "GST included" : "+ GST";
/** "AUD 99/mo, GST included" — fine print / hero form. */
export const PRICE_MONTHLY_WITH_GST = `${PRICE_MONTHLY}, ${GST_SUFFIX}`;
/** "AUD 99/mo inc GST" — compact comparison-table / label form. */
export const PRICE_MONTHLY_INC_GST = `${PRICE_MONTHLY} inc GST`;
/** "Solo — AUD 99/mo inc GST" — account subscription label. */
export const SOLO_PLAN_LABEL = `${PRICING.planName} — ${PRICE_MONTHLY_INC_GST}`;
/** "28-day" — reusable trial-length adjective. */
export const TRIAL_LENGTH_LABEL = `${PRICING.trialDays}-day`;
