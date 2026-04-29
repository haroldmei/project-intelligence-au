// Portal data loaders — server-component data for portal pages.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-024, FR-026, FR-027 | system-design §2 portal component + §4 API
//
// Called by frontend-developer's server components — pure data loaders, no UI here.
import { db } from "@/lib/db";

export interface DigestSummary {
  id: string;
  sentAt: string | null;
  daCount: number;
  emailStatus: string | null;
  smsStatus: string | null;
  fallbackUsed: boolean;
  runDate: string;
}

export interface DigestCard {
  daId: string;
  rank: number;
  relevanceScore: number;
  whyMatched: string;
  address: string;
  council: string;
  estimatedValue: number | null;
  portalUrl: string;
  applicantName: string | null;
  description: string;
  lodgementDate: string;
  userFeedback: "up" | "down" | null;
}

export interface DigestDetail extends DigestSummary {
  cards: DigestCard[];
}

export interface MyArea {
  lgaBundles: Array<{ id: string; label: string; lgaCount: number }>;
  savedQueryText: string | null;
  smsOptIn: boolean;
  mobile_e164: string | null;
}

/**
 * Get the most recent digest for a user (for the portal home page).
 * FR-026 | system-design §2 portal
 */
export async function getCurrentDigest(userId: string): Promise<DigestDetail | null> {
  const digest = await db.digest.findFirst({
    where: { userId },
    orderBy: { sentAt: "desc" },
    include: {
      run: { select: { runDate: true } },
      digestDas: {
        orderBy: { rank: "asc" },
        include: {
          da: {
            select: {
              id: true,
              address: true,
              council: true,
              estimatedValue: true,
              portalUrl: true,
              applicantName: true,
              description: true,
              lodgementDate: true,
            },
          },
        },
      },
    },
  });
  if (!digest) return null;

  const feedbackMap = await getUserFeedbackMap(userId, digest.digestDas.map((d) => d.daId));

  return {
    id: digest.id,
    sentAt: digest.sentAt?.toISOString() ?? null,
    daCount: digest.daCount,
    emailStatus: digest.emailStatus,
    smsStatus: digest.smsStatus,
    fallbackUsed: digest.fallbackUsed,
    runDate: digest.run.runDate.toISOString().slice(0, 10),
    cards: digest.digestDas.map((dd) => ({
      daId: dd.daId,
      rank: dd.rank,
      relevanceScore: dd.relevanceScore,
      whyMatched: dd.whyMatched,
      address: dd.da.address,
      council: dd.da.council,
      estimatedValue: dd.da.estimatedValue ? Number(dd.da.estimatedValue) : null,
      portalUrl: dd.da.portalUrl,
      applicantName: dd.da.applicantName,
      description: dd.da.description,
      lodgementDate: dd.da.lodgementDate.toISOString().slice(0, 10),
      userFeedback: feedbackMap.get(dd.daId) ?? null,
    })),
  };
}

/**
 * Get paginated digest history for a user.
 * FR-026 | system-design §4 GET /api/digests
 */
export async function getDigestHistory(
  userId: string,
  limit = 20,
): Promise<DigestSummary[]> {
  const digests = await db.digest.findMany({
    where: { userId },
    orderBy: { sentAt: "desc" },
    take: limit,
    include: { run: { select: { runDate: true } } },
  });

  return digests.map((d) => ({
    id: d.id,
    sentAt: d.sentAt?.toISOString() ?? null,
    daCount: d.daCount,
    emailStatus: d.emailStatus,
    smsStatus: d.smsStatus,
    fallbackUsed: d.fallbackUsed,
    runDate: d.run.runDate.toISOString().slice(0, 10),
  }));
}

/**
 * Get a single digest detail for the portal digest page.
 * FR-024 | system-design §4 GET /api/digests/:id
 */
export async function getDigestById(userId: string, digestId: string): Promise<DigestDetail | null> {
  const digest = await db.digest.findFirst({
    where: { id: digestId, userId },
    include: {
      run: { select: { runDate: true } },
      digestDas: {
        orderBy: { rank: "asc" },
        include: {
          da: {
            select: {
              id: true,
              address: true,
              council: true,
              estimatedValue: true,
              portalUrl: true,
              applicantName: true,
              description: true,
              lodgementDate: true,
            },
          },
        },
      },
    },
  });
  if (!digest) return null;

  const feedbackMap = await getUserFeedbackMap(userId, digest.digestDas.map((d) => d.daId));

  return {
    id: digest.id,
    sentAt: digest.sentAt?.toISOString() ?? null,
    daCount: digest.daCount,
    emailStatus: digest.emailStatus,
    smsStatus: digest.smsStatus,
    fallbackUsed: digest.fallbackUsed,
    runDate: digest.run.runDate.toISOString().slice(0, 10),
    cards: digest.digestDas.map((dd) => ({
      daId: dd.daId,
      rank: dd.rank,
      relevanceScore: dd.relevanceScore,
      whyMatched: dd.whyMatched,
      address: dd.da.address,
      council: dd.da.council,
      estimatedValue: dd.da.estimatedValue ? Number(dd.da.estimatedValue) : null,
      portalUrl: dd.da.portalUrl,
      applicantName: dd.da.applicantName,
      description: dd.da.description,
      lodgementDate: dd.da.lodgementDate.toISOString().slice(0, 10),
      userFeedback: feedbackMap.get(dd.daId) ?? null,
    })),
  };
}

/**
 * Get the user's "My Area" settings for the account page.
 * FR-027 | system-design §4 GET /api/account/*
 */
export async function getMyArea(userId: string): Promise<MyArea | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      lgaBundles: {
        include: {
          bundle: { include: { lgas: { select: { id: true } } } },
        },
      },
    },
  });
  if (!user) return null;

  return {
    lgaBundles: user.lgaBundles.map((sub) => ({
      id: sub.bundle.id,
      label: sub.bundle.label,
      lgaCount: sub.bundle.lgas.length,
    })),
    savedQueryText: user.savedQueryText,
    smsOptIn: user.smsOptIn,
    mobile_e164: user.mobile_e164,
  };
}

async function getUserFeedbackMap(
  userId: string,
  daIds: string[],
): Promise<Map<string, "up" | "down">> {
  if (daIds.length === 0) return new Map();
  const rows = await db.daFeedback.findMany({
    where: { userId, daId: { in: daIds } },
    select: { daId: true, feedback: true },
  });
  return new Map(rows.map((r) => [r.daId, r.feedback as "up" | "down"]));
}
