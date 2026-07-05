// LLM rerank — Anthropic Claude haiku-4-5 primary, sonnet-4-6 fallback.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2 | Phase: ai-features
//
// Stage 3 of the relevance pipeline (system-design §3.3 / §contract.ai.relevance_pipeline).
// Input: top-K candidates already prefiltered by SQL rule + pgvector cosine.
// Output: scored top-N (score 4+ unless a quiet-week signal) with one-sentence "why".
// Records token cost in ai_cost_log under phase=rerank.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { composeRerankSystemPrompt, getPack } from "@/verticals";
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

/**
 * FR-006 digest floor, expressed on the 0–5 rerank rubric. A DA must score
 * ≥ 2 to be surfaced — i.e. `relevance_score = score * 2 ≥ 4` on the 0–10 scale
 * the SRS (FR-006) and the digest cards (assemble.ts) speak in.
 *
 * This is the SINGLE source of the floor: relevance-pipeline.ts defaults
 * `minScoreForDigest` to it and rerankCandidates defaults `minScore` to it, so
 * the two can never silently drift again — the drift was the root of issue #163,
 * where the pipeline defaulted to 0 and surfaced DAs the model scored 0/10.
 */
export const DIGEST_MIN_RERANK_SCORE = 2;

/**
 * Cap for any single untrusted DA field before it is interpolated into the
 * rerank prompt (G-005 prompt-injection defence). Real portal descriptions and
 * scope text are ≤ a few KB; anything larger is malformed or hostile. 4000
 * chars ≈ ~1k tokens per field — comfortably above every genuine DA.
 */
const MAX_FIELD_CHARS = 4000;

/**
 * Neutralise an untrusted, portal-scraped (or user-typed) string before it is
 * interpolated into the rerank prompt. This is the core of the G-005 defence:
 *
 *  - caps length so an oversized field can't blow the context window or cost,
 *  - collapses C0/C1 control characters (except tab/newline) that could smuggle
 *    in terminal or JSON-breaking bytes,
 *  - escapes the XML delimiter tokens (`&`, `<`, `>`) so DA text can never forge
 *    or close the `<description>`-style data tags that wrap it — the delimiters
 *    the system prompt relies on to tell data from instructions.
 *
 * Exported for the adversarial injection tests.
 */
export function sanitizeDaField(raw: string | null | undefined): string {
  if (raw == null) return "";
  let s = String(raw);
  if (s.length > MAX_FIELD_CHARS) {
    s = `${s.slice(0, MAX_FIELD_CHARS)}…[truncated]`;
  }
  // Drop C0/C1 control chars, keeping only tab (\t) and newline (\n).
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, " ");
  // Escape delimiter tokens — ampersand first so we don't double-escape.
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return s;
}

/**
 * Neutralise `da_id` before it is interpolated into the prompt. Unlike the
 * other untrusted fields, da_id is inserted RAW and OUTSIDE any delimiter tag
 * (see `renderUserPrompt`) — it must stay legible so the model can echo it
 * back verbatim for output matching, so HTML-escaping (which changes the
 * text, like {@link sanitizeDaField} does) is the wrong tool here. Instead
 * this strips everything a scraped council reference could use to break out
 * of the `<candidate>` block: control chars (including newline — da_id is a
 * single-line, undelimited field) and the `<`/`>` tag-delimiter characters.
 * `rerankCandidates` builds `validIds` from this same sanitised value, so the
 * "did we actually send this id" check still lines up byte-for-byte with
 * what the model saw.
 *
 * Exported for the adversarial injection tests.
 */
export function sanitizeDaId(raw: string | null | undefined): string {
  if (raw == null) return "";
  let s = String(raw);
  if (s.length > MAX_FIELD_CHARS) {
    s = s.slice(0, MAX_FIELD_CHARS);
  }
  // Unlike sanitizeDaField, tab/newline are NOT preserved here — da_id is a
  // single-line, undelimited field, so a bare newline is itself a
  // block-break-out vector.
  s = s.replace(/[\u0000-\u001F\u007F-\u009F<>]/g, "");
  return s;
}

export interface RerankCandidate {
  daId: string;
  council: string;
  address: string;
  description: string;
  rawScopeText: string | null;
  estimatedValue: number | null;
  /** ISO yyyy-mm-dd */
  lodgementDate: string;
  /** ISO yyyy-mm-dd a Construction Certificate was issued against this DA (#13),
   *  or null. Surfaced to the model as a "work starting now" timing signal. */
  constructionCertifiedAt: string | null;
  /** NSW approval pathway (#10): "da" | "cdc" | "ssd". Surfaced to the model so a
   *  CDC re-roof (the tile→metal pathway) is treated as a strong positive. */
  approvalPathway: string;
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
  /** 0–5 integer per the trade rubric (src/verticals/roofing/prompt-fragment.md). */
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
  _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

/**
 * Load prompt files at runtime. We don't bundle them so prompt edits
 * don't require a re-deploy in dev — and so the version header stays
 * inspectable on disk. In production, Next.js will include them in the
 * function bundle via the standard file-tracing.
 *
 * The SYSTEM prompt is no longer read directly: it is composed from the shared
 * base template + the active trade's rerank fragment (see `systemPrompt` below
 * and src/verticals/rerank-prompt.ts). This loader now serves the user template.
 */
function loadPrompt(name: "rerank.user.md"): string {
  // process.cwd() is the project root in Next.js serverless functions
  const p = path.join(process.cwd(), "src", "prompts", name);
  return readFileSync(p, "utf-8");
}

/**
 * The rerank system prompt for the active (single-trade) digest. Composed from
 * the base template + the roofing pack's fragment (#27). Byte-identical to the
 * pre-extraction src/prompts/rerank.system.md — locked by
 * src/verticals/roofing/rerank-prompt.test.ts.
 */
function buildSystemPrompt(): string {
  const pack = getPack("roofing");
  if (!pack) throw new Error("[rerank] roofing vertical pack is not registered");
  return composeRerankSystemPrompt(pack);
}

/**
 * Render the user-prompt template. Minimal mustache-ish substitution —
 * we don't want a Handlebars dep just for two placeholders.
 *
 * Every untrusted field (portal-scraped DA text and the user's own free-text
 * query) is passed through {@link sanitizeDaField} and wrapped in XML-style
 * delimiter tags. The system prompt declares that anything inside those tags is
 * data, never instructions (G-005). `da_id` is also untrusted (portal-scraped,
 * no ingest-time charset validation) but is interpolated OUTSIDE any delimiter
 * tag so the model can echo it back for output matching, so it goes through
 * {@link sanitizeDaId} instead — stripping rather than escaping, so it stays
 * byte-exact for real (control-char-free) DA references while a payload can no
 * longer break out of the `<candidate>` block. `lodgement_date` and
 * `estimated_value` are structured values we produce, so they are inserted
 * verbatim.
 *
 * Exported for the adversarial injection tests.
 */
export function renderUserPrompt(input: RerankInput): string {
  const tpl = loadPrompt("rerank.user.md");
  // Strip frontmatter
  const body = tpl.replace(/^---[\s\S]*?---\n/, "");

  const candidatesBlock = input.candidates
    .map(
      (c) => `<candidate>
da_id: ${sanitizeDaId(c.daId)}
council: <council>${sanitizeDaField(c.council)}</council>
address: <address>${sanitizeDaField(c.address)}</address>
lodgement_date: ${c.lodgementDate}${
        c.constructionCertifiedAt
          ? `\nconstruction_certificate_issued: ${c.constructionCertifiedAt} (work starting now — strongest timing signal)`
          : ""
      }
approval_pathway: ${c.approvalPathway}${
        c.approvalPathway === "cdc"
          ? " (Complying Development Certificate — the fast-track re-roof pathway that carries tile→metal / Colorbond conversions; treat a roofing CDC as a strong positive)"
          : ""
      }
estimated_value: ${c.estimatedValue ?? "unknown"}
<description>
${sanitizeDaField(c.description)}
</description>
<raw_scope_text>
${sanitizeDaField(c.rawScopeText)}
</raw_scope_text>
</candidate>`,
    )
    .join("\n");

  const thumbsBlock =
    input.thumbsExamples && input.thumbsExamples.length > 0
      ? `\n# Personalisation — recent thumbs (use only to break ties)\n\n${input.thumbsExamples
          .map(
            (t) =>
              `- [${t.feedback}] <thumb>${sanitizeDaField(t.daText)}</thumb>`,
          )
          .join("\n")}\n`
      : "";

  const savedQueryBlock = `<saved_query>\n${sanitizeDaField(
    input.savedQueryText,
  )}\n</saved_query>`;
  const lgaBlock = input.userLgaSlugs.map((s) => sanitizeDaField(s)).join(", ");

  // Function replacers so `$` sequences inside sanitized text aren't treated as
  // regex substitution specials.
  return body
    .replace(/\{\{saved_query_text\}\}/g, () => savedQueryBlock)
    .replace(/\{\{user_lga_slugs\}\}/g, () => lgaBlock)
    .replace(/\{\{#thumbs_examples\}\}[\s\S]*?\{\{\/thumbs_examples\}\}/g, () => thumbsBlock)
    .replace(/\{\{#each candidates\}\}[\s\S]*?\{\{\/each\}\}/g, () => candidatesBlock);
}

interface ParsedModelOutput {
  results: Array<{
    da_id: string;
    score: number;
    why: string;
    confidence: number;
  }>;
}

/**
 * Parse the model's JSON reply into a results array. Response hardening for
 * G-005: a non-conforming reply (non-JSON, or a shape without a `results`
 * array) never throws — it yields an empty batch so those candidates fall
 * through as unscored and the digest run continues instead of crashing.
 */
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
    console.warn(
      `[rerank] model returned non-JSON; treating batch as unscored: ${cleaned.slice(0, 200)}…`,
    );
    return { results: [] };
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as ParsedModelOutput).results)
  ) {
    console.warn(
      `[rerank] model output missing results array; treating batch as unscored: ${cleaned.slice(0, 200)}`,
    );
    return { results: [] };
  }
  return parsed as ParsedModelOutput;
}

async function callModel(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{
  parsed: ParsedModelOutput;
  inputTokens: number;
  outputTokens: number;
}> {
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    // Extract just the text from the response — we don't use tool use here.
  });
  const textBlock = res.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
  if (!text) {
    console.warn("[rerank] model returned no text content; treating batch as unscored");
  }
  const parsed = parseModelOutput(text);
  return {
    parsed,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

/**
 * Rerank candidates with the LLM. Returns top-N (default: candidates scoring
 * ≥ DIGEST_MIN_RERANK_SCORE on the 0–5 rubric = relevance_score ≥ 4, the FR-006
 * digest floor) sorted by score descending. Records cost in ai_cost_log.
 *
 * Fallback path: if the primary model returns ANY candidate with
 * confidence < FALLBACK_CONFIDENCE_THRESHOLD, we re-run those low-confidence
 * rows through the sonnet model and merge results.
 */
export async function rerankCandidates(
  input: RerankInput,
  opts: { topN?: number; minScore?: number; client?: Anthropic } = {},
): Promise<RerankResult[]> {
  if (input.candidates.length === 0) return [];

  const client = opts.client ?? getClient();
  const systemPrompt = buildSystemPrompt();
  const userPrompt = renderUserPrompt(input);
  const weekStart = input.weekStart ?? weekStartAEST();

  // Only ids we actually sent are acceptable in the reply. A row for any other
  // id (a model hallucination, or an id echoed out of injected DA text) is
  // dropped — the model MUST NOT return DAs not in the input list. Built from
  // sanitizeDaId (same as the prompt interpolation above) so this lines up
  // byte-for-byte with what the model actually saw and can echo back.
  const validIds = new Set(input.candidates.map((c) => sanitizeDaId(c.daId)));

  // Primary call
  const primary = await callModel(client, PRIMARY_MODEL, systemPrompt, userPrompt);
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
  applyRows(primary.parsed.results, validIds, PRIMARY_MODEL, byId);

  // Identify low-confidence rows for fallback escalation
  const lowConfIds = [...byId.values()]
    .filter((r) => r.confidence < FALLBACK_CONFIDENCE_THRESHOLD)
    .map((r) => r.daId);

  if (lowConfIds.length > 0) {
    const subset = input.candidates.filter((c) => lowConfIds.includes(c.daId));
    const fallbackInput: RerankInput = { ...input, candidates: subset };
    const fallbackPrompt = renderUserPrompt(fallbackInput);
    const fallback = await callModel(
      client,
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
    applyRows(fallback.parsed.results, validIds, FALLBACK_MODEL, byId);
  }

  // Default to the shared FR-006 floor (DIGEST_MIN_RERANK_SCORE = rubric 2 =
  // relevance_score 4). The pipeline passes one explicitly, but sharing the
  // constant means an ad-hoc caller (eval scripts, future utilities) that omits
  // it still gets the production floor rather than surfacing 0-scored DAs.
  const minScore = opts.minScore ?? DIGEST_MIN_RERANK_SCORE;
  const sorted = [...byId.values()]
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);

  return opts.topN ? sorted.slice(0, opts.topN) : sorted;
}

/**
 * Validate one score from the model. Response hardening for G-005: a score
 * outside the 0–5 rubric (or non-numeric) is rejected rather than clamped, so
 * an injection that coaxes the model into `"score": 99` doesn't silently become
 * a top-ranked 5 — the row is dropped and the candidate is left unscored.
 */
function validScore(n: unknown): number | null {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0 || v > 5) return null;
  return v;
}

/**
 * Merge a batch of model rows into `byId`, skipping any row whose id we didn't
 * send or whose score fails {@link validScore}. Dropped rows leave that
 * candidate unscored (the low-confidence / omitted path) — never a crash.
 */
function applyRows(
  rows: ParsedModelOutput["results"],
  validIds: Set<string>,
  model: string,
  byId: Map<string, RerankResult>,
): void {
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const daId = typeof r.da_id === "string" ? r.da_id : "";
    if (!validIds.has(daId)) continue;
    const score = validScore(r.score);
    if (score === null) continue;
    byId.set(daId, {
      daId,
      score,
      why: clipWhy(r.why),
      confidence: clamp01(r.confidence),
      modelUsed: model,
    });
  }
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
