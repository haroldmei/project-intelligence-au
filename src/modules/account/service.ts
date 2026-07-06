// Account service — profile, LGA bundle CRUD, saved query re-embed, GDPR erasure.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-020, FR-022 | system-design §2 portal + §4 API
import { db } from "@/lib/db";
import { embed } from "@/lib/ai/embeddings";
import { captureServer } from "@/lib/analytics/server";
import {
  getActiveSubscription,
  cancelSubscriptionAtPeriodEnd,
} from "@/modules/billing/stripe";
import pino from "pino";

const log = pino({ name: "account" });

/** Full account DTO returned from GET /api/account/me */
export interface AccountDTO {
  id: string;
  email: string;
  mobile_e164: string | null;
  emailVerified: boolean;
  emailOptIn: boolean;
  smsOptIn: boolean;
  stormBriefOptIn: boolean;
  trade: string;
  subscriptionStatus: string;
  accessUntil: string | null;
  plan: string | null;
  cancelAtPeriodEnd: boolean;
  savedQueryText: string | null;
  lgaBundles: string[];
  createdAt: string;
}

export async function getAccount(userId: string): Promise<AccountDTO | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { lgaBundles: true },
  });
  if (!user) return null;
  return toDTO(user);
}

export async function updateProfile(
  userId: string,
  data: { mobile_e164?: string | null },
): Promise<AccountDTO> {
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      // Tri-state on mobile_e164 (#166): `undefined` means "not submitted" →
      // leave the column alone; a string sets it; `null` explicitly removes it.
      // The old `? {..} : {}` collapsed null and undefined together, so clearing
      // the field silently no-opped while the UI reported "Saved."
      ...(data.mobile_e164 !== undefined
        ? {
            mobile_e164: data.mobile_e164,
            // A number that's gone can't receive SMS — clear the opt-in with it
            // so we never keep a dangling smsOptIn=true against a null mobile.
            ...(data.mobile_e164 === null ? { smsOptIn: false } : {}),
          }
        : {}),
    },
    include: { lgaBundles: true },
  });
  return toDTO(updated);
}

/**
 * Thrown when a submitted bundle id doesn't reference a real LgaBundle row.
 * The route maps this to a 422 client error instead of a 500 (#134).
 */
export class UnknownLgaBundleError extends Error {
  readonly bundleIds: string[];
  constructor(bundleIds: string[]) {
    super(`Unknown LGA bundle id(s): ${bundleIds.join(", ")}`);
    this.name = "UnknownLgaBundleError";
    this.bundleIds = bundleIds;
  }
}

export async function updateLgaBundles(userId: string, bundleIds: string[]): Promise<AccountDTO> {
  // Validate every submitted id references a real LgaBundle up front (#134).
  // Zod only checks the ids are non-empty strings — it can't know whether they
  // reference real rows. Without this, a stale/bogus id (a client bug, a bundle
  // deleted between page load and submit) throws P2003 from createMany AFTER
  // deleteMany has already wiped the user's coverage. Reject cleanly instead.
  const uniqueIds = [...new Set(bundleIds)];
  if (uniqueIds.length > 0) {
    const existing = await db.lgaBundle.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    const known = new Set(existing.map((b) => b.id));
    const unknown = uniqueIds.filter((id) => !known.has(id));
    if (unknown.length > 0) throw new UnknownLgaBundleError(unknown);
  }

  // Replace all subscriptions atomically (#134): if createMany fails, the
  // deleteMany rolls back so the user is never stranded with zero coverage
  // (which would silently drop them from the Sunday digest — the paid product).
  await db.$transaction([
    db.lgaBundleSubscription.deleteMany({ where: { userId } }),
    db.lgaBundleSubscription.createMany({
      data: bundleIds.map((bundleId) => ({ userId, bundleId })),
      skipDuplicates: true,
    }),
  ]);
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { lgaBundles: true },
  });
  // Activation signal (FR-031): which users picked their lead coverage, and how
  // wide. bundleCount only — bundle *ids* aren't PII but the count is the funnel
  // metric that matters; keeps the shape minimal.
  captureServer(userId, "lga_bundle_selected", { bundleCount: bundleIds.length });
  return toDTO(user);
}

/**
 * Update the saved query text and re-embed via OpenAI (FR-015 / A.7 step 6).
 * Uses the user's own userId for cost attribution.
 */
export async function updateSavedQuery(
  userId: string,
  savedQueryText: string,
): Promise<AccountDTO> {
  log.info({ userId }, "[account] re-embedding saved query");
  const embedding = await embed(savedQueryText, { userId });
  const pgVec = `[${embedding.join(",")}]`;

  // Raw SQL to write the vector(1536) column (Prisma Unsupported type)
  await db.$executeRaw`
    UPDATE users SET
      saved_query_text = ${savedQueryText},
      saved_query_embedding = ${pgVec}::vector
    WHERE id = ${userId}
  `;

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { lgaBundles: true },
  });
  return toDTO(user);
}

/**
 * SMS opt-in. Requires mobile_e164 to be set.
 */
export async function smsOptIn(userId: string): Promise<AccountDTO> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mobile_e164) throw new Error("Mobile number required for SMS opt-in");
  const updated = await db.user.update({
    where: { id: userId },
    data: { smsOptIn: true },
    include: { lgaBundles: true },
  });
  return toDTO(updated);
}

/**
 * SMS opt-out.
 */
export async function smsOptOut(userId: string): Promise<AccountDTO> {
  const updated = await db.user.update({
    where: { id: userId },
    data: { smsOptIn: false },
    include: { lgaBundles: true },
  });
  return toDTO(updated);
}

/**
 * Email opt-in (#105). The mirror of the token-based unsubscribe: once a user
 * has tapped the email footer's one-click unsubscribe (emailOptIn=false), this
 * is the ONLY in-product path back to the paid Sunday digest. Without it, a
 * paying subscriber who unsubscribes keeps being billed while getting nothing —
 * guaranteed churn. Authenticated because it's a session-scoped self-service
 * control, unlike the unauthenticated Spam-Act opt-out link.
 */
export async function emailOptIn(userId: string): Promise<AccountDTO> {
  const updated = await db.user.update({
    where: { id: userId },
    data: { emailOptIn: true },
    include: { lgaBundles: true },
  });
  return toDTO(updated);
}

/**
 * Email opt-out (#105). The authenticated equivalent of the unsubscribe link,
 * so the /account notifications page can present a single bidirectional toggle.
 */
export async function emailOptOut(userId: string): Promise<AccountDTO> {
  const updated = await db.user.update({
    where: { id: userId },
    data: { emailOptIn: false },
    include: { lgaBundles: true },
  });
  return toDTO(updated);
}

/**
 * Set the per-user storm-brief opt-in (#20). Default is opted-in while the
 * feature stays globally gated behind STORM_BRIEF_ENABLED; this lets a user opt
 * out ahead of the global launch. Independent of the Spam Act email opt-out —
 * the cron ANDs both.
 */
export async function setStormBriefOptIn(userId: string, optIn: boolean): Promise<AccountDTO> {
  const updated = await db.user.update({
    where: { id: userId },
    data: { stormBriefOptIn: optIn },
    include: { lgaBundles: true },
  });
  return toDTO(updated);
}

/**
 * GDPR/Privacy Act erasure — cancels any active Stripe subscription, then
 * deletes the user and all cascade-deleted rows.
 * Idempotent: if the user is already deleted (P2025), returns cleanly.
 * AT-005 fix: (a) Stripe subscription cancelled before user row deleted;
 *             (b) P2025 "record not found" caught — safe to call twice.
 * Preview-tier note: Stripe call failure is logged and tolerated (does NOT 500);
 * the user row is still deleted. At launch tier, add a `deletion_pending` column
 * and a retry cron for failed Stripe cancellations.
 * FR: wedge-supporting (data privacy per contract.security.public_data_only).
 */
export async function deleteAccount(userId: string): Promise<void> {
  log.warn({ userId }, "[account] GDPR erasure — starting");

  // Step 1: Look up stripe customer id (may be null for trial-only users).
  let stripeCustomerId: string | null = null;
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
    stripeCustomerId = user?.stripeCustomerId ?? null;
  } catch (err) {
    log.error({ userId, err }, "[account] deleteAccount — could not fetch stripe customer id; proceeding");
  }

  // Step 2: Cancel any live Stripe subscription — active, trialing, or dunning
  // (past_due/unpaid/paused, #132) — before erasure (AT-005a).
  if (stripeCustomerId) {
    try {
      const sub = await getActiveSubscription(stripeCustomerId);
      if (sub) {
        await cancelSubscriptionAtPeriodEnd(sub.id);
        log.info({ userId, subscriptionId: sub.id }, "[account] Stripe subscription cancelled at period end");
      }
    } catch (err) {
      // Preview-tier: log and proceed — do NOT 500 the client (AT-005 preview-tier note).
      log.error({ userId, stripeCustomerId, err }, "[account] deleteAccount — Stripe cancellation failed; proceeding with erasure");
    }
  }

  // Step 3: Delete the user row (Prisma cascade handles related rows).
  try {
    await db.user.delete({ where: { id: userId } });
    log.warn({ userId }, "[account] GDPR erasure — user deleted");
  } catch (err) {
    // P2025 = record not found; user already deleted — idempotent (AT-005b).
    // Detect by err.code (Prisma's structured error code), not the message —
    // message text varies across Prisma versions and locales.
    if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2025") {
      log.info({ userId }, "[account] deleteAccount — user already deleted (idempotent)");
      return;
    }
    throw err;
  }
}

/**
 * Data export — returns a JSON blob of all user data.
 * FR: wedge-supporting (Privacy Act 2024 export right).
 */
export async function exportAccountData(userId: string): Promise<Record<string, unknown>> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      lgaBundles: true,
      digests: { take: 50, orderBy: { sentAt: "desc" } },
      daFeedback: { take: 500 },
      aiCostLog: { take: 200 },
    },
  });
  // Strip sensitive fields
  const { passwordHash: _pw, savedQueryEmbedding: _vec, stripeCustomerId: _sc, ...safe } = user as typeof user & { passwordHash: string; savedQueryEmbedding: unknown; stripeCustomerId: string };
  return safe as Record<string, unknown>;
}

type UserWithBundles = {
  id: string;
  email: string;
  mobile_e164: string | null;
  emailVerified: boolean;
  emailOptIn: boolean;
  smsOptIn: boolean;
  stormBriefOptIn: boolean;
  trade: string;
  subscriptionStatus: string;
  accessUntil: Date | null;
  plan: string | null;
  cancelAtPeriodEnd: boolean;
  savedQueryText: string | null;
  createdAt: Date;
  lgaBundles: Array<{ bundleId: string }>;
};

function toDTO(user: UserWithBundles): AccountDTO {
  return {
    id: user.id,
    email: user.email,
    mobile_e164: user.mobile_e164,
    emailVerified: user.emailVerified,
    emailOptIn: user.emailOptIn,
    smsOptIn: user.smsOptIn,
    stormBriefOptIn: user.stormBriefOptIn,
    trade: user.trade,
    subscriptionStatus: user.subscriptionStatus,
    accessUntil: user.accessUntil?.toISOString() ?? null,
    plan: user.plan,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
    savedQueryText: user.savedQueryText,
    lgaBundles: user.lgaBundles.map((s) => s.bundleId),
    createdAt: user.createdAt.toISOString(),
  };
}
