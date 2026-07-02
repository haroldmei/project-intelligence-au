// Weekly precision recap stat (CF-1.7, design pillar P4 "Proof, Not Promise").
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// product-spec §3 CF-1.7 | ux-design §1 P4 + wireframe 7.6
//
// The month-2/3 retention driver: "your leads were the right leads." Rendered as
// a badge above the DA cards in the portal and as a block at the top of the
// weekly email — but only from week 4, once there's enough signal to be honest.
//
// Precision here is the textbook TP/(TP+FP) over the user's own thumbs across a
// trailing 4-week window: a thumbs-up is a true positive (a genuine re-roof lead
// we surfaced), a thumbs-down is a false positive (noise we shouldn't have sent).
// Un-rated cards are excluded — we only claim precision over leads the user
// actually judged, which is the honest, self-contained proxy the spec footnote
// (§591) calls for until a per-LGA ops-labelled ground-truth set exists at scale.
import { db } from "@/lib/db";

/** Trailing window the recap stat is computed over (CF-1.7: "Last 4 weeks"). */
export const PRECISION_WINDOW_WEEKS = 4;
const WINDOW_MS = PRECISION_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000;

/** Minimum sent digests before the recap is shown (CF-1.7: "from week 4"). */
export const PRECISION_MIN_WEEKS = 4;

export interface PrecisionRecap {
  /** 0–100, rounded. Share of rated leads that were thumbed up. */
  precision: number;
  /** Length of the window the stat covers, in weeks. */
  weeks: number;
}

/**
 * Compute the trailing-4-week precision recap for a user from their thumbs.
 * Returns null when the user has rated no leads in the window (nothing honest
 * to claim — the caller shows the onboarding tip instead of an empty slot).
 *
 * `now` is injectable so the window is deterministic under test.
 */
export async function computePrecisionRecap(
  userId: string,
  now: Date = new Date(),
): Promise<PrecisionRecap | null> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const rows = await db.daFeedback.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { feedback: true },
  });

  let up = 0;
  let total = 0;
  for (const r of rows) {
    if (r.feedback === "up") {
      up += 1;
      total += 1;
    } else if (r.feedback === "down") {
      total += 1;
    }
  }
  if (total === 0) return null;

  return {
    precision: Math.round((up / total) * 100),
    weeks: PRECISION_WINDOW_WEEKS,
  };
}

/**
 * Count a user's sent digests — the "weeks of history" that gates the recap
 * (CF-1.7: absent below 4). Excludes the digest currently being assembled
 * (`excludeDigestId`) so the send path can add 1 for the in-flight week and
 * match the portal's post-send count exactly.
 */
export async function countSentDigests(
  userId: string,
  excludeDigestId?: string,
): Promise<number> {
  return db.digest.count({
    where: {
      userId,
      sentAt: { not: null },
      ...(excludeDigestId ? { NOT: { id: excludeDigestId } } : {}),
    },
  });
}
