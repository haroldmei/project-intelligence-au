// Weekly rated-lead recap stat (CF-1.7, design pillar P4 "Proof, Not Promise").
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// product-spec §3 CF-1.7 | ux-design §1 P4 + wireframe 7.6
//
// The month-2/3 retention driver: "your leads were the right leads." Rendered as
// a badge above the DA cards in the portal and as a block at the top of the
// weekly email — but only from week 4, once there's enough signal to be honest.
//
// WHAT THIS MEASURES (issue #186): the share of the leads the user *rated* (👍/👎)
// across a trailing 4-week window that they marked 👍 — their own on-target rate.
// It is NOT FR-013's ground-truth precision: it never consults da_ground_truth and
// its denominator is the user's own rated total, not the census of genuine re-roof
// DAs in their LGAs. Because that ops-maintained per-LGA ground-truth census does
// not exist at production scale (da_ground_truth holds only the small eval gold set),
// N-of-M ground-truth precision would be null for nearly every user; the honest,
// self-contained stat we can show today is this rated-lead on-target rate. The word
// "precision" is deliberately NOT used on any surface — see docs/02 FR-013.
import { db } from "@/lib/db";

/** Trailing window the recap stat is computed over (CF-1.7: "Last 4 weeks"). */
export const RECAP_WINDOW_WEEKS = 4;
const WINDOW_MS = RECAP_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000;

/** Minimum sent digests before the recap is shown (CF-1.7: "from week 4"). */
export const RECAP_MIN_WEEKS = 4;

export interface RatedLeadRecap {
  /** Leads thumbed up in the window — the "N" ("you marked N on-target"). */
  onTarget: number;
  /** Leads rated (👍 or 👎) in the window — the "M" (the honest denominator). */
  rated: number;
  /** 0–100, rounded. onTarget / rated × 100 — the share marked on-target. */
  rate: number;
  /** Length of the window the stat covers, in weeks. */
  weeks: number;
}

/**
 * Compute the trailing-4-week rated-lead recap for a user from their thumbs.
 * Returns null when the user has rated no leads in the window (nothing honest
 * to claim — the caller shows the onboarding tip instead of an empty slot).
 *
 * `now` is injectable so the window is deterministic under test.
 */
export async function computeRatedLeadRecap(
  userId: string,
  now: Date = new Date(),
): Promise<RatedLeadRecap | null> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const rows = await db.daFeedback.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { feedback: true },
  });

  let onTarget = 0;
  let rated = 0;
  for (const r of rows) {
    if (r.feedback === "up") {
      onTarget += 1;
      rated += 1;
    } else if (r.feedback === "down") {
      rated += 1;
    }
  }
  if (rated === 0) return null;

  return {
    onTarget,
    rated,
    rate: Math.round((onTarget / rated) * 100),
    weeks: RECAP_WINDOW_WEEKS,
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
