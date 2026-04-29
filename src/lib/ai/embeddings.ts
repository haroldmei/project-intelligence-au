// OpenAI embeddings wrapper.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2 | Phase: ai-features
//
// Contract:
//   ai.embedding_provider = openai
//   ai.embedding_model    = text-embedding-3-small  (1536 dims)
//   ai.cost_tracking      = required
//
// Returns a number[] of length 1536. Records token usage in ai_cost_log.
// Never re-embeds the saved query (caller is responsible for caching
// `users.saved_query_embedding`). For DA chunks, this is called once per
// new DA at digest time per the system-design data flow.
import OpenAI from "openai";
import { env } from "@/lib/env";
import {
  priceFor,
  recordAiCost,
  weekStartAEST,
  type AiCostInput,
} from "./cost-ledger";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

/**
 * Lazily-created OpenAI client — kept lazy so tests can mock OpenAI without
 * having to set OPENAI_API_KEY. Validation of the key happened at import of
 * @/lib/env, so we know it's set by the time getClient() is called.
 */
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

export interface EmbedOptions {
  /**
   * User the embedding is attributed to in `ai_cost_log`. Required for
   * the AUD 0.50/user/month ceiling enforcement. Pass `null` when
   * embedding system-level content (e.g. seed roofing-vocabulary string
   * at deploy time) — no cost row written in that case.
   */
  userId: string | null;
  /**
   * Anchors the cost row to a digest week. Defaults to current AEST week
   * start. Override only for backfills.
   */
  weekStart?: Date;
}

/**
 * Embed a single string. Returns a 1536-dim vector. Throws on API error
 * (caller should retry with backoff per system-design §7.3).
 */
export async function embed(
  text: string,
  opts: EmbedOptions,
): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("[embeddings] cannot embed empty string");
  }
  const client = getClient();
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    // OpenAI returns 1536 dims by default for this model; explicit for clarity.
    dimensions: EMBEDDING_DIMS,
    encoding_format: "float",
  });
  const vector = res.data[0]?.embedding;
  if (!vector || vector.length !== EMBEDDING_DIMS) {
    throw new Error(
      `[embeddings] unexpected vector length: got ${vector?.length}, expected ${EMBEDDING_DIMS}`,
    );
  }
  if (opts.userId) {
    const inputTokens = res.usage?.prompt_tokens ?? estimateTokens(text);
    const cost: AiCostInput = {
      userId: opts.userId,
      phase: "embedding",
      model: EMBEDDING_MODEL,
      inputTokens,
      outputTokens: 0,
      costAud: priceFor(EMBEDDING_MODEL, inputTokens, 0),
      weekStart: opts.weekStart ?? weekStartAEST(),
    };
    await recordAiCost(cost);
  }
  return vector;
}

/**
 * Embed many strings in one API call. OpenAI batches up to 2048 inputs
 * per request; caller must chunk above that. Returns vectors in the same
 * order as inputs.
 */
export async function embedBatch(
  texts: string[],
  opts: EmbedOptions,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const MAX_BATCH = 2048;
  if (texts.length > MAX_BATCH) {
    throw new Error(
      `[embeddings] batch size ${texts.length} exceeds ${MAX_BATCH}; chunk before calling`,
    );
  }
  const client = getClient();
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMS,
    encoding_format: "float",
  });
  const vectors = res.data.map((d) => d.embedding);
  if (opts.userId) {
    const inputTokens =
      res.usage?.prompt_tokens ??
      texts.reduce((s, t) => s + estimateTokens(t), 0);
    await recordAiCost({
      userId: opts.userId,
      phase: "embedding",
      model: EMBEDDING_MODEL,
      inputTokens,
      outputTokens: 0,
      costAud: priceFor(EMBEDDING_MODEL, inputTokens, 0),
      weekStart: opts.weekStart ?? weekStartAEST(),
    });
  }
  return vectors;
}

/**
 * Cheap token estimate fallback when the API doesn't return usage.
 * Heuristic: ~4 chars per token for English. Off by ±20% but only used
 * as a fallback for the cost ledger.
 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export const EMBEDDING_DIMENSIONS = EMBEDDING_DIMS;
export const EMBEDDING_MODEL_ID = EMBEDDING_MODEL;

/**
 * Parse a pgvector text representation back into a number[].
 * pgvector serialises vectors as "[1.2,3.4,...]" — strip brackets and split.
 * Used when reading Unsupported("vector(1536)") columns via $queryRaw.
 */
export function parseVector(s: string): number[] {
  return s
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map(Number);
}
