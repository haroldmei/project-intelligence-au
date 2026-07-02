// Analytics event catalogue — the single source of truth for every product
// event we send to PostHog and the exact property shape each one carries.
//
// PRIVACY (contract.security.public_data_only + issue #17): properties NEVER
// carry PII (email, mobile, name) or DA payload text (address, description,
// applicant). Users are identified by internal user id only. Keeping the shapes
// here — and typing `captureServer` against them — makes an accidental
// `properties: { email }` a compile error at the call site.

/** North-star instrumentation surface. Add new events here, not ad-hoc at call sites. */
export interface AnalyticsEventProperties {
  /** Account row created (server-side signup completion). */
  signup_started: Record<string, never>;
  /** OTP verified — user.emailVerified flipped true. */
  email_verified: Record<string, never>;
  /** First saved-query save — end of the onboarding flow. */
  onboarding_completed: Record<string, never>;
  /** LGA bundle selection saved (activation step — FR-031 `lga_bundle_selected`). */
  lga_bundle_selected: { bundleCount: number };
  /** 28-day trial began (at signup, or on a checkout that grants a trial). */
  trial_started: { source: "signup" | "checkout" };
  /** Subscription transitioned into `active` from a non-active state. */
  trial_converted: Record<string, never>;
  /** Subscription deleted at Stripe (hard cancel). */
  subscription_cancelled: { cancelAtPeriodEnd: boolean };
  /** One user's weekly digest was assembled + sent. */
  digest_sent: { cardCount: number; fallbackUsed: boolean };
  /** Thumb up/down on a DA card (portal or email link). */
  da_feedback: { vote: "up" | "down"; source: "email" | "portal" };
  /** Portal "View DA →" click-out to a council portal (FR-031 `da_card_clicked`).
   *  Client-side event — the only one gated on the browser cookie banner. */
  da_card_clicked: { source: "portal" };
  /** A digest short-link / email link resolved to a DA portal. Cookieless. */
  portal_clickthrough: { source: "sms" | "email"; slug?: string };
}

export type AnalyticsEventName = keyof AnalyticsEventProperties;
