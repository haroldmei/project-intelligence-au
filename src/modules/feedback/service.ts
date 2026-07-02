// Feedback service — upsert thumb up/down for a DA.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-023, FR-024 | system-design §2 feedback, §4 API design
import { db } from "@/lib/db";
import { captureServer } from "@/lib/analytics/server";

export type FeedbackVote = "up" | "down";

/**
 * Upsert a thumb vote for a (userId, daId) pair.
 * schema has UNIQUE (user_id, da_id) so this is an idempotent upsert.
 */
export async function recordFeedback(
  userId: string,
  daId: string,
  vote: FeedbackVote,
  source: "email" | "portal",
): Promise<void> {
  await db.daFeedback.upsert({
    where: { userId_daId: { userId, daId } },
    create: { userId, daId, feedback: vote, source },
    update: { feedback: vote, source },
  });
  // Single choke point for both channels (portal POST + email GET link).
  // daId is an internal DA id, not payload text — safe to send.
  captureServer(userId, "da_feedback", { vote, source });
}

/**
 * Remove a feedback row (portal "undo" action).
 */
export async function removeFeedback(userId: string, daId: string): Promise<void> {
  await db.daFeedback.deleteMany({ where: { userId, daId } });
}
