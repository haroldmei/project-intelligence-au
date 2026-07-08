// Rerank eval harness (issue #19, parameterised by (vertical, jurisdiction) in
// issue #31) — `pnpm eval:rerank`.
//
// Runs a vertical's rerank prompt over its gold set
// (evals/rerank/<vertical>-<jurisdiction>.jsonl) and reports precision, recall
// and F1 at the digest-inclusion threshold plus the within-±1 score / keyword /
// schema assertions. Writes a dated, committed result to
// evals/rerank/eval-results/<vertical>-<jurisdiction>-<date>.json.
//
// Faithful to production: composeRerankSystemPrompt pulls the *chosen* vertical's
// pack from the registry (so each trade is graded against the prompt it actually
// runs with), reuses rerank.user.md, and calls the same Anthropic model the
// runtime does. Skips gracefully (exit 0) when ANTHROPIC_API_KEY is absent so
// quality gates never depend on it.
//
// Usage:
//   pnpm eval:rerank                              # every vertical that has a dataset file
//   pnpm eval:rerank --vertical roofing           # single target (jurisdiction defaults to nsw)
//   pnpm eval:rerank --vertical demolition --jurisdiction nsw
//   pnpm eval:rerank --model sonnet               # run against the sonnet fallback
//   EVAL_INCLUSION_THRESHOLD=4 pnpm eval:rerank
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseJsonl } from "@/modules/evals/export";
import { resolveThreshold, type ModelScore } from "@/modules/evals/metrics";
import { runRerankEval, type ModelCaller } from "@/modules/evals/eval-runner";
import {
  DEFAULT_VERTICAL,
  DEFAULT_JURISDICTION,
  datasetFilename,
  resultFilename,
  discoverTargets,
  targetLabel,
  type EvalTarget,
} from "@/modules/evals/targets";

const PRIMARY_MODEL = "claude-haiku-4-5";
const FALLBACK_MODEL = "claude-sonnet-4-6";

const RERANK_DIR = path.join(process.cwd(), "evals", "rerank");
const RESULTS_DIR = path.join(RERANK_DIR, "eval-results");

function pickModel(argv: string[]): string {
  const i = argv.indexOf("--model");
  if (i >= 0) {
    const v = (argv[i + 1] ?? "").toLowerCase();
    if (v === "sonnet" || v === FALLBACK_MODEL) return FALLBACK_MODEL;
    if (v === "haiku" || v === PRIMARY_MODEL) return PRIMARY_MODEL;
  }
  return PRIMARY_MODEL;
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/**
 * Which (vertical, jurisdiction) sets to run. If either axis is passed
 * explicitly, run that single target (filling the other with its default). With
 * no axis flags, sweep every dataset file on disk.
 */
function resolveTargets(argv: string[]): EvalTarget[] {
  const vertical = flag(argv, "--vertical");
  const jurisdiction = flag(argv, "--jurisdiction");
  if (vertical || jurisdiction) {
    return [
      {
        vertical: vertical ?? DEFAULT_VERTICAL,
        jurisdiction: jurisdiction ?? DEFAULT_JURISDICTION,
      },
    ];
  }
  const names = existsSync(RERANK_DIR) ? readdirSync(RERANK_DIR) : [];
  return discoverTargets(names);
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

  const targets = resolveTargets(argv);
  if (targets.length === 0) {
    console.log(`eval:rerank SKIPPED — no dataset files in ${RERANK_DIR}.`);
    return;
  }

  const model = pickModel(argv);
  const threshold = resolveThreshold(process.env.EVAL_INCLUSION_THRESHOLD);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const date = isoDate();

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

  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  const summary: Array<{ target: string; n: number; precision: number; recall: number; f1: number; gate: boolean }> = [];

  for (const target of targets) {
    const datasetPath = path.join(RERANK_DIR, datasetFilename(target));
    if (!existsSync(datasetPath)) {
      console.log(`\n${targetLabel(target)}: SKIPPED — no dataset at ${datasetPath}.`);
      continue;
    }
    const cases = parseJsonl(readFileSync(datasetPath, "utf-8"));
    if (cases.length === 0) {
      console.log(`\n${targetLabel(target)}: SKIPPED — ${datasetFilename(target)} is empty.`);
      continue;
    }

    console.log(
      `\n═══ ${targetLabel(target)} — model=${model}, ${cases.length} cases, inclusion threshold=${threshold} ═══`,
    );

    const report = await runRerankEval(cases, call, {
      vertical: target.vertical,
      jurisdiction: target.jurisdiction,
      threshold,
      model,
    });

    const m = report.metrics;
    console.log("─── Metrics @ inclusion threshold " + threshold + " ───");
    console.log(`  precision : ${m.precision.toFixed(3)}  (tp=${m.tp} fp=${m.fp})`);
    console.log(`  recall    : ${m.recall.toFixed(3)}  (tp=${m.tp} fn=${m.fn})`);
    console.log(`  F1        : ${m.f1.toFixed(3)}`);
    console.log(`  gate      : precision ≥ ${report.gate.precisionTarget} & recall ≥ ${report.gate.recallTarget} → ${report.gate.passed ? "PASS" : "not met"}`);
    console.log("─── Assertions ───");
    console.log(`  within ±1 : ${pct(report.assertions.within1Rate)}  ${report.assertions.within1Pass ? "(≥80% ✓)" : "(<80% ✗)"}`);
    console.log(`  keyword   : ${pct(report.assertions.keywordRate)}`);
    console.log(`  schema    : ${pct(report.assertions.schemaValidRate)}`);

    const outPath = path.join(RESULTS_DIR, resultFilename(target, date));
    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(outPath, JSON.stringify({ date, ...report }, null, 2) + "\n");
    console.log(`  wrote ${path.relative(process.cwd(), outPath)}`);

    summary.push({
      target: targetLabel(target),
      n: report.n,
      precision: m.precision,
      recall: m.recall,
      f1: m.f1,
      gate: report.gate.passed,
    });
  }

  // Per-(vertical, jurisdiction) summary table.
  if (summary.length > 0) {
    const w = Math.max(12, ...summary.map((s) => s.target.length));
    console.log(`\n═══ Summary ═══`);
    console.log(`${"target".padEnd(w)}  ${"n".padStart(4)}  ${"prec".padStart(6)}  ${"recall".padStart(6)}  ${"F1".padStart(6)}  gate`);
    for (const s of summary) {
      console.log(
        `${s.target.padEnd(w)}  ${String(s.n).padStart(4)}  ${s.precision.toFixed(3).padStart(6)}  ${s.recall.toFixed(3).padStart(6)}  ${s.f1.toFixed(3).padStart(6)}  ${s.gate ? "PASS" : "—"}`,
      );
    }
  }

  // Informational only — do NOT exit non-zero on an unmet gate; this command is
  // a measurement tool, not a quality gate (issue #19 acceptance).
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
