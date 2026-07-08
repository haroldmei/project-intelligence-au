// Load thumbs examples for personalised rerank prompt (FR-025).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Implements PipelineDeps.loadThumbsExamples for runRelevancePipeline.
// Activates only when the user has ≥ 25 total feedback rows (FR-025).
import { db } from "@/lib/db";

// Issue #11: lowered from 200 → 25. At the restored 5–15 cards/week × ~80%
// thumb rate a user clears 25 labels in ~4–6 weeks (the wedge doc's activation
// window), whereas 200 would have taken ~1.6 years — the feedback moat never
// activated. See docs/24-market-gap-analysis-and-q3-roadmap.md (G6).
export const MIN_FEEDBACK_FOR_PERSONALISATION = 25;
const MAX_EXAMPLES_PER_SIDE = 5;

/**
 * Returns up to 10 thumbs examples (5 up + 5 down, most recent).
 * Returns empty array if user has fewer than 25 total feedback rows (FR-025).
 */
export async function loadThumbsExamples({
  userId,
}: {
  userId: string;
}): Promise<Array<{ daText: string; feedback: "up" | "down" }>> {
  const totalCount = await db.daFeedback.count({ where: { userId } });
  if (totalCount < MIN_FEEDBACK_FOR_PERSONALISATION) return [];

  const upRows = await db.daFeedback.findMany({
    where: { userId, feedback: "up" },
    orderBy: { createdAt: "desc" },
    take: MAX_EXAMPLES_PER_SIDE,
    include: { da: { select: { description: true, address: true } } },
  });
  const downRows = await db.daFeedback.findMany({
    where: { userId, feedback: "down" },
    orderBy: { createdAt: "desc" },
    take: MAX_EXAMPLES_PER_SIDE,
    include: { da: { select: { description: true, address: true } } },
  });

  const toExample = (
    row: { da: { address: string; description: string }; feedback: string },
    side: "up" | "down",
  ) => ({
    daText: `${row.da.address}: ${row.da.description}`.slice(0, 200),
    feedback: side,
  });

  return [
    ...upRows.map((r) => toExample(r, "up")),
    ...downRows.map((r) => toExample(r, "down")),
  ];
}
