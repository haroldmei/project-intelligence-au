// Stage 2: pgvector cosine similarity query + lazy embedding of new DAs.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-005 | system-design §3.4 per-user query + vector/embedding tables
//
// Implements PipelineDeps.vectorRank for runRelevancePipeline.
import { db } from "@/lib/db";
import { embedBatch } from "@/lib/ai/embeddings";
import type { CandidateDA } from "@/lib/ai/relevance-pipeline";
import pino from "pino";
import { weekStartAEST } from "@/lib/ai/cost-ledger";

const log = pino({ name: "relevance-vector" });

/**
 * Stage 2: embed any candidates that lack a da_embeddings row, then run
 * the pgvector cosine similarity query per system-design §3.4.
 *
 * Returns the top `topK` candidates ordered by cosine similarity descending.
 */
export async function vectorRank({
  userId,
  candidates,
  userEmbedding,
  topK,
}: {
  userId: string;
  candidates: CandidateDA[];
  userEmbedding: number[];
  topK: number;
}): Promise<CandidateDA[]> {
  if (candidates.length === 0) return [];
  const weekStart = weekStartAEST();

  // Find DAs that don't have an embedding yet
  const daIds = candidates.map((c) => c.daId);
  const existing = await db.daEmbedding.findMany({
    where: { daId: { in: daIds } },
    select: { daId: true },
  });
  const embeddedSet = new Set(existing.map((e) => e.daId));
  const toEmbed = candidates.filter((c) => !embeddedSet.has(c.daId));

  // Batch embed new DAs (lazy, per system-design §3.4)
  if (toEmbed.length > 0) {
    const texts = toEmbed.map(
      (c) => `${c.address} ${c.description} ${c.rawScopeText ?? ""}`.trim(),
    );
    log.info({ count: toEmbed.length, userId }, "[vector] embedding new DAs");

    // embedBatch handles up to 2048 inputs; DAs per run < 500 (rule filter limit)
    const vectors = await embedBatch(texts, { userId, weekStart });

    // Upsert embeddings — raw SQL for the vector(1536) column (Prisma Unsupported type)
    for (let i = 0; i < toEmbed.length; i++) {
      const da = toEmbed[i];
      const vec = vectors[i];
      if (!vec) continue;
      const pgVec = `[${vec.join(",")}]`;
      await db.$executeRaw`
        INSERT INTO da_embeddings (da_id, embedding, embedded_at)
        VALUES (${da.daId}, ${pgVec}::vector, now())
        ON CONFLICT (da_id) DO UPDATE SET embedding = EXCLUDED.embedding, embedded_at = now()
      `;
    }
  }

  // pgvector cosine query per system-design §3.4
  // `<=>` is the pgvector cosine distance operator; 1 - distance = similarity
  const userVec = `[${userEmbedding.join(",")}]`;
  const ranked = await db.$queryRaw<
    Array<{ da_id: string; cosine_sim: number }>
  >`
    SELECT
      e.da_id,
      (1 - (e.embedding <=> ${userVec}::vector)) AS cosine_sim
    FROM da_embeddings e
    WHERE e.da_id = ANY(${daIds})
    ORDER BY e.embedding <=> ${userVec}::vector
    LIMIT ${topK}
  `;

  const simById = new Map(ranked.map((r) => [r.da_id, r.cosine_sim]));
  const candidateById = new Map(candidates.map((c) => [c.daId, c]));

  const results: CandidateDA[] = [];
  for (const r of ranked) {
    const c = candidateById.get(r.da_id);
    if (!c) continue;
    results.push({ ...c, cosineSimilarity: simById.get(r.da_id) ?? 0 });
  }
  return results;
}
