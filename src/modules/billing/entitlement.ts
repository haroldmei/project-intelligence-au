// Entitlement gate — "is this user still allowed to receive the paid deliverable?"
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — AUD 99/mo.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-018 / UC-002 (docs/02-system-requirements.md §trial) | issue #87
//
// THE BUG THIS CLOSES (issue #87): a self-serve signup creates a User with
// subscriptionStatus:"trial", accessUntil:null, stripeCustomerId:null and NO
// Stripe subscription. The ONLY writes that move status off "trial" are the
// Stripe webhooks — which never fire for a user who never entered checkout. So
// gating the digest/storm crons on the status STRING alone
// (`subscriptionStatus in ["trial","active"]`) hands the paid product out free
// forever. The fix: gate on an unexpired access WINDOW, not the status string.
//
// A user is entitled to the paid deliverable when:
//   - active                → paying (Stripe manages the renewal window); OR
//   - trial + accessUntil    → a Stripe-managed trial/paid window, entitled
//                              while accessUntil is in the future; OR
//   - trial + no accessUntil → a self-signup trial with no Stripe subscription,
//                              entitled only while createdAt + trialDays hasn't
//                              elapsed (this is the window that used to be
//                              unbounded); OR
//   - past_due + accessUntil → a paying subscriber whose card is failing, in
//                              Stripe's multi-day smart-retry (dunning) window
//                              (issue #106). The subscription is still LIVE, not
//                              cancelled. Keep delivering through the period they
//                              already paid for (accessUntil) — the Sunday digest
//                              is the one weekly touchpoint that prompts them to
//                              fix their card, so dropping them here is exactly
//                              the wrong moment. Bounded by accessUntil like the
//                              Stripe-managed-trial branch, so a stuck past_due
//                              row can't be handed the paid product forever (the
//                              same unbounded-grant leak issue #87 closed).
// Everything else (cancelled, expired, past_due with a lapsed/absent access
// window) is NOT entitled. A real past_due subscription always carries an
// accessUntil (it was set by the prior active/trial subscription event), so a
// null one is anomalous and treated as not entitled — defensively bounded.
import type { Prisma } from "@prisma/client";
import { PRICING } from "@/lib/pricing";

const MS_PER_DAY = 86_400_000;

/** The self-signup trial window length, in milliseconds. */
export const TRIAL_WINDOW_MS = PRICING.trialDays * MS_PER_DAY;

/** The subset of User fields the entitlement decision reads. */
export interface EntitlementUser {
  subscriptionStatus: string;
  accessUntil: Date | null;
  createdAt: Date;
}

/**
 * Pure predicate mirror of {@link entitledDigestWhere}. Kept in lockstep with
 * the Prisma fragment below so the two can be cross-checked in tests. Prefer the
 * `where` fragment for DB selection; use this for in-memory re-checks / tests.
 */
export function isDigestEntitled(user: EntitlementUser, now: Date = new Date()): boolean {
  if (user.subscriptionStatus === "active") return true;
  if (user.subscriptionStatus === "trial") {
    // A self-signup trial has no accessUntil, so fall back to the createdAt +
    // trialDays window. A Stripe-managed trial carries accessUntil and is
    // authoritative.
    const deadlineMs =
      user.accessUntil?.getTime() ?? user.createdAt.getTime() + TRIAL_WINDOW_MS;
    return deadlineMs > now.getTime();
  }
  if (user.subscriptionStatus === "past_due") {
    // Card in Stripe dunning (issue #106): entitled through the already-paid
    // window, bounded. A null accessUntil is anomalous for past_due — not
    // entitled.
    return user.accessUntil != null && user.accessUntil.getTime() > now.getTime();
  }
  return false;
}

/**
 * Prisma `where` fragment selecting users currently entitled to the paid
 * deliverable (weekly digest, storm brief). AND this with the per-channel
 * filters (emailVerified, emailOptIn, stormBriefOptIn) at the call site.
 *
 * `now` is injectable for deterministic tests; production passes the default.
 */
export function entitledDigestWhere(now: Date = new Date()): Prisma.UserWhereInput {
  // A self-signup trial is expired once its account is older than trialDays.
  const trialCutoff = new Date(now.getTime() - TRIAL_WINDOW_MS);
  return {
    OR: [
      // Paying customer — Stripe owns the renewal window.
      { subscriptionStatus: "active" },
      // Stripe-managed trial (or paid-through window): explicit deadline ahead.
      { subscriptionStatus: "trial", accessUntil: { gt: now } },
      // Self-signup trial with no Stripe subscription: entitled only until
      // createdAt + trialDays elapses. THIS is the bound issue #87 was missing.
      { subscriptionStatus: "trial", accessUntil: null, createdAt: { gt: trialCutoff } },
      // Paying subscriber in Stripe dunning (issue #106): card failing, sub
      // still live, entitled through the already-paid window (accessUntil).
      // Bounded like the Stripe-managed-trial branch — a null accessUntil is
      // anomalous for past_due and is deliberately excluded.
      { subscriptionStatus: "past_due", accessUntil: { gt: now } },
    ],
  };
}
