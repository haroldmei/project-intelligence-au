// Load thumbs examples for personalised rerank prompt (FR-025).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Implements PipelineDeps.loadThumbsExamples for runRelevancePipeline.
// Activates only when the user has ≥ 200 total feedback rows (FR-025).
import { db } from "@/lib/db";

const MIN_FEEDBACK_FOR_PERSONALISATION = 200;
const MAX_EXAMPLES_PER_SIDE = 5;

/**
 * Returns up to 10 thumbs examples (5 up + 5 down, most recent).
 * Returns empty array if user has fewer than 200 total feedback rows (FR-025).
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
