// LLM rerank — Anthropic Claude haiku-4-5 primary, sonnet-4-6 fallback.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2 | Phase: ai-features
//
// Stage 3 of the relevance pipeline (system-design §3.3 / §contract.ai.relevance_pipeline).
// Input: top-K candidates already prefiltered by SQL rule + pgvector cosine.
// Output: scored top-N (score 4+ unless a quiet-week signal) with one-sentence "why".
// Records token cost in ai_cost_log under phase=rerank.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  priceFor,
  recordAiCost,
  weekStartAEST,
} from "./cost-ledger";

const PRIMARY_MODEL = "claude-haiku-4-5";
const FALLBACK_MODEL = "claude-sonnet-4-6";

/**
 * Confidence threshold below which we re-run the rerank with the
 * fallback (sonnet) model. From system-design §7.3 fallback notes —
 * we trust haiku at ≥ 0.5 confidence, escalate below.
 */
const FALLBACK_CONFIDENCE_THRESHOLD = 0.5;

export interface RerankCandidate {
  daId: string;
  council: string;
  address: string;
  description: string;
  rawScopeText: string | null;
  estimatedValue: number | null;
  /** ISO yyyy-mm-dd */
  lodgementDate: string;
}

export interface RerankInput {
  userId: string;
  savedQueryText: string;
  /** Length-1536 vector. Not sent to LLM — used by upstream cosine stage. */
  savedQueryEmbedding: number[];
  userLgaSlugs: string[];
  candidates: RerankCandidate[];
  /** Optional past thumbs to inject into the prompt for personalisation (FR-025). */
  thumbsExamples?: Array<{ daText: string; feedback: "up" | "down" }>;
  /** Anchors cost rows. Defaults to the current AEST week. */
  weekStart?: Date;
}

export interface RerankResult {
  daId: string;
  /** 0–5 integer per rubric in src/prompts/rerank.system.md */
  score: number;
  /** ≤ 140 chars, one sentence. */
  why: string;
  /** 0.0–1.0, model's self-reported confidence. */
  confidence: number;
  /** Which model produced this row (primary or fallback). */
  modelUsed: string;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[rerank] ANTHROPIC_API_KEY missing — set in env or .env.local",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Load prompt files at runtime. We don't bundle them so prompt edits
 * don't require a re-deploy in dev — and so the version header stays
 * inspectable on disk. In production, Next.js will include them in the
 * function bundle via the standard file-tracing.
 */
function loadPrompt(name: "rerank.system.md" | "rerank.user.md"): string {
  // process.cwd() is the project root in Next.js serverless functions
  const p = path.join(process.cwd(), "src", "prompts", name);
  return readFileSync(p, "utf-8");
}

/**
 * Render the user-prompt template. Minimal mustache-ish substitution —
 * we don't want a Handlebars dep just for two placeholders.
 */
function renderUserPrompt(input: RerankInput): string {
  const tpl = loadPrompt("rerank.user.md");
  // Strip frontmatter
  const body = tpl.replace(/^---[\s\S]*?---\n/, "");

  const candidatesBlock = input.candidates
    .map(
      (c) => `---
da_id: ${c.daId}
council: ${c.council}
address: ${c.address}
lodgement_date: ${c.lodgementDate}
estimated_value: ${c.estimatedValue ?? "unknown"}
description: |
  ${c.description.replace(/\n/g, "\n  ")}
raw_scope_text: |
  ${(c.rawScopeText ?? "").replace(/\n/g, "\n  ")}`,
    )
    .join("\n");

  const thumbsBlock =
    input.thumbsExamples && input.thumbsExamples.length > 0
      ? `\n# Personalisation — recent thumbs (use only to break ties)\n\n${input.thumbsExamples
          .map((t) => `- [${t.feedback}] ${t.daText}`)
          .join("\n")}\n`
      : "";

  return body
    .replace(/\{\{saved_query_text\}\}/g, input.savedQueryText)
    .replace(/\{\{user_lga_slugs\}\}/g, input.userLgaSlugs.join(", "))
    .replace(/\{\{#thumbs_examples\}\}[\s\S]*?\{\{\/thumbs_examples\}\}/g, thumbsBlock)
    .replace(/\{\{#each candidates\}\}[\s\S]*?\{\{\/each\}\}/g, candidatesBlock);
}

interface ParsedModelOutput {
  results: Array<{
    da_id: string;
    score: number;
    why: string;
    confidence: number;
  }>;
}

function parseModelOutput(raw: string): ParsedModelOutput {
  // Strip code fences if the model added them despite instructions
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `[rerank] model returned non-JSON: ${cleaned.slice(0, 200)}…`,
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as ParsedModelOutput).results)
  ) {
    throw new Error(
      `[rerank] model output missing results array: ${cleaned.slice(0, 200)}`,
    );
  }
  return parsed as ParsedModelOutput;
}

async function callModel(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{
  parsed: ParsedModelOutput;
  inputTokens: number;
  outputTokens: number;
}> {
  const client = getClient();
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    // Extract just the text from the response — we don't use tool use here.
  });
  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("[rerank] model returned no text content");
  }
  const parsed = parseModelOutput(textBlock.text);
  return {
    parsed,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

/**
 * Rerank candidates with the LLM. Returns top-N (default: all candidates
 * scored ≥ 4) sorted by score descending. Records cost in ai_cost_log.
 *
 * Fallback path: if the primary model returns ANY candidate with
 * confidence < FALLBACK_CONFIDENCE_THRESHOLD, we re-run those low-confidence
 * rows through the sonnet model and merge results.
 */
export async function rerankCandidates(
  input: RerankInput,
  opts: { topN?: number; minScore?: number } = {},
): Promise<RerankResult[]> {
  if (input.candidates.length === 0) return [];

  const systemPrompt = loadPrompt("rerank.system.md");
  const userPrompt = renderUserPrompt(input);
  const weekStart = input.weekStart ?? weekStartAEST();

  // Primary call
  const primary = await callModel(PRIMARY_MODEL, systemPrompt, userPrompt);
  await recordAiCost({
    userId: input.userId,
    phase: "rerank",
    model: PRIMARY_MODEL,
    inputTokens: primary.inputTokens,
    outputTokens: primary.outputTokens,
    costAud: priceFor(
      PRIMARY_MODEL,
      primary.inputTokens,
      primary.outputTokens,
    ),
    weekStart,
  });

  // Map primary results
  const byId = new Map<string, RerankResult>();
  for (const r of primary.parsed.results) {
    byId.set(r.da_id, {
      daId: r.da_id,
      score: clampScore(r.score),
      why: clipWhy(r.why),
      confidence: clamp01(r.confidence),
      modelUsed: PRIMARY_MODEL,
    });
  }

  // Identify low-confidence rows for fallback escalation
  const lowConfIds = [...byId.values()]
    .filter((r) => r.confidence < FALLBACK_CONFIDENCE_THRESHOLD)
    .map((r) => r.daId);

  if (lowConfIds.length > 0) {
    const subset = input.candidates.filter((c) => lowConfIds.includes(c.daId));
    const fallbackInput: RerankInput = { ...input, candidates: subset };
    const fallbackPrompt = renderUserPrompt(fallbackInput);
    const fallback = await callModel(
      FALLBACK_MODEL,
      systemPrompt,
      fallbackPrompt,
    );
    await recordAiCost({
      userId: input.userId,
      phase: "rerank",
      model: FALLBACK_MODEL,
      inputTokens: fallback.inputTokens,
      outputTokens: fallback.outputTokens,
      costAud: priceFor(
        FALLBACK_MODEL,
        fallback.inputTokens,
        fallback.outputTokens,
      ),
      weekStart,
    });
    for (const r of fallback.parsed.results) {
      byId.set(r.da_id, {
        daId: r.da_id,
        score: clampScore(r.score),
        why: clipWhy(r.why),
        confidence: clamp01(r.confidence),
        modelUsed: FALLBACK_MODEL,
      });
    }
  }

  const minScore = opts.minScore ?? 4;
  const sorted = [...byId.values()]
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);

  return opts.topN ? sorted.slice(0, opts.topN) : sorted;
}

function clampScore(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(5, v));
}

function clamp01(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function clipWhy(s: unknown): string {
  const text = typeof s === "string" ? s : "";
  return text.slice(0, 140);
}

export const RERANK_PRIMARY_MODEL = PRIMARY_MODEL;
export const RERANK_FALLBACK_MODEL = FALLBACK_MODEL;
