// Rerank eval harness (issue #19) — `pnpm eval:rerank`.
//
// Runs the roofing rerank prompt over the gold set (evals/rerank/dataset.jsonl)
// and reports precision, recall and F1 at the digest-inclusion threshold plus
// the existing within-±1 score / keyword / schema assertions. Writes a dated,
// committed result to evals/rerank/eval-results/<date>.json.
//
// Faithful to production: reuses composeRerankSystemPrompt (base + roofing
// fragment) and the rerank.user.md template, and calls the same Anthropic model
// the runtime does. Skips gracefully (exit 0) when ANTHROPIC_API_KEY is absent
// so quality gates never depend on it.
//
// Usage:
//   pnpm eval:rerank                 # haiku primary, 22-case gold set
//   pnpm eval:rerank --model sonnet  # run against the sonnet fallback
//   EVAL_INCLUSION_THRESHOLD=4 pnpm eval:rerank
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseJsonl } from "@/modules/evals/export";
import { resolveThreshold, type ModelScore } from "@/modules/evals/metrics";
import { runRerankEval, type ModelCaller } from "@/modules/evals/eval-runner";

const PRIMARY_MODEL = "claude-haiku-4-5";
const FALLBACK_MODEL = "claude-sonnet-4-6";

const DATASET_PATH = path.join(process.cwd(), "evals", "rerank", "dataset.jsonl");
const RESULTS_DIR = path.join(process.cwd(), "evals", "rerank", "eval-results");

function pickModel(argv: string[]): string {
  const i = argv.indexOf("--model");
  if (i >= 0) {
    const v = (argv[i + 1] ?? "").toLowerCase();
    if (v === "sonnet" || v === FALLBACK_MODEL) return FALLBACK_MODEL;
    if (v === "haiku" || v === PRIMARY_MODEL) return PRIMARY_MODEL;
  }
  return PRIMARY_MODEL;
}

function parseModelOutput(raw: string): ModelScore {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as {
    results?: Array<{ score: number; why: string; confidence: number }>;
  };
  const first = parsed.results?.[0];
  if (!first) throw new Error(`model output missing results[0]: ${cleaned.slice(0, 160)}`);
  return { score: first.score, why: first.why, confidence: first.confidence };
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // Graceful skip — the model key is the hard dependency; quality gates must
  // never fail because it's absent (issue #19 acceptance).
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("eval:rerank SKIPPED — ANTHROPIC_API_KEY not set. (This is expected in CI/quality gates.)");
    return;
  }
  if (!existsSync(DATASET_PATH)) {
    console.log(`eval:rerank SKIPPED — no dataset at ${DATASET_PATH}.`);
    return;
  }

  const cases = parseJsonl(readFileSync(DATASET_PATH, "utf-8"));
  if (cases.length === 0) {
    console.log("eval:rerank SKIPPED — dataset.jsonl is empty.");
    return;
  }

  const model = pickModel(argv);
  const threshold = resolveThreshold(process.env.EVAL_INCLUSION_THRESHOLD);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log(`Running rerank eval — model=${model}, ${cases.length} cases, inclusion threshold=${threshold}\n`);

  const call: ModelCaller = async ({ system, user }) => {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("model returned no text content");
    return parseModelOutput(text.text);
  };

  const report = await runRerankEval(cases, call, { threshold, model });

  const m = report.metrics;
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  console.log("─── Metrics @ inclusion threshold " + threshold + " ───");
  console.log(`  precision : ${m.precision.toFixed(3)}  (tp=${m.tp} fp=${m.fp})`);
  console.log(`  recall    : ${m.recall.toFixed(3)}  (tp=${m.tp} fn=${m.fn})`);
  console.log(`  F1        : ${m.f1.toFixed(3)}`);
  console.log(`  gate      : precision ≥ ${report.gate.precisionTarget} & recall ≥ ${report.gate.recallTarget} → ${report.gate.passed ? "PASS" : "not met"}`);
  console.log("─── Assertions ───");
  console.log(`  within ±1 : ${pct(report.assertions.within1Rate)}  ${report.assertions.within1Pass ? "(≥80% ✓)" : "(<80% ✗)"}`);
  console.log(`  keyword   : ${pct(report.assertions.keywordRate)}`);
  console.log(`  schema    : ${pct(report.assertions.schemaValidRate)}`);

  const date = isoDate();
  const outPath = path.join(RESULTS_DIR, `${date}.json`);
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(outPath, JSON.stringify({ date, ...report }, null, 2) + "\n");
  console.log(`\nWrote ${outPath}`);

  // Informational only — do NOT exit non-zero on an unmet gate; this command is
  // a measurement tool, not a quality gate (issue #19 acceptance).
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
