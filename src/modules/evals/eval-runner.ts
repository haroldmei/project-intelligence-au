// Rerank eval orchestration (issue #19) — turns the gold dataset into a scored
// precision/recall report by driving a model caller over each case.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// jsdom-safe: builds prompts from files (composeRerankSystemPrompt is fs-only)
// and takes the model call as an injected function, so it imports NO Anthropic
// client and NO @/lib/env. The real Anthropic wiring lives in
// scripts/eval-rerank.ts. Tests inject a fake caller.
import { readFileSync } from "node:fs";
import path from "node:path";
import { composeRerankSystemPrompt, getRegisteredPack } from "@/verticals";
import type { EvalCase } from "./export";
import {
  gradeCase,
  precisionRecallF1,
  rate,
  meetsGate,
  PRECISION_TARGET,
  RECALL_TARGET,
  type CaseGrade,
  type ModelScore,
  type PrecisionRecall,
} from "./metrics";

/** Called once per case with the composed system + user prompt. */
export type ModelCaller = (args: {
  system: string;
  user: string;
  evalCase: EvalCase;
}) => Promise<ModelScore>;

/** Compose the roofing rerank system prompt (base template + roofing fragment). */
export function buildRoofingSystemPrompt(): string {
  const pack = getRegisteredPack("roofing");
  if (!pack) throw new Error("[eval] roofing vertical pack is not registered");
  return composeRerankSystemPrompt(pack);
}

/**
 * Render the user prompt for a single eval case, reusing the production
 * rerank.user.md template with the same minimal substitution rerank.ts does.
 * One candidate per call so the grader can pluck results[0].
 */
export function renderEvalUserPrompt(c: EvalCase): string {
  const tpl = readFileSync(
    path.join(process.cwd(), "src", "prompts", "rerank.user.md"),
    "utf-8",
  );
  const body = tpl.replace(/^---[\s\S]*?---\n/, "");

  const candidatesBlock = `---
da_id: ${c.da_id ?? "eval-0"}
council: ${c.council}
address: ${c.lga_slug}
lodgement_date: unknown
estimated_value: ${c.estimated_value ?? "unknown"}
description: |
  ${c.da_text.replace(/\n/g, "\n  ")}
raw_scope_text: |
  `;

  return body
    .replace(/\{\{saved_query_text\}\}/g, c.saved_query)
    .replace(/\{\{user_lga_slugs\}\}/g, c.user_lga_slugs.join(", "))
    .replace(/\{\{#thumbs_examples\}\}[\s\S]*?\{\{\/thumbs_examples\}\}/g, "")
    .replace(/\{\{#each candidates\}\}[\s\S]*?\{\{\/each\}\}/g, candidatesBlock);
}

export interface EvalCaseResult {
  da_text: string;
  council: string;
  predicted: number;
  expected: number;
  why: string;
  confidence: number;
  grade: CaseGrade;
}

export interface EvalReport {
  model: string;
  threshold: number;
  n: number;
  metrics: PrecisionRecall;
  assertions: {
    within1Rate: number;
    keywordRate: number;
    schemaValidRate: number;
    /** Dev-plan gate: ≥ 80% of cases within ±1 of the gold score. */
    within1Pass: boolean;
  };
  gate: {
    precisionTarget: number;
    recallTarget: number;
    passed: boolean;
  };
  cases: EvalCaseResult[];
}

export interface RunEvalOptions {
  threshold: number;
  model: string;
  precisionTarget?: number;
  recallTarget?: number;
}

/**
 * Score every case with the injected caller and assemble the report. Pure
 * orchestration — no I/O beyond reading the prompt templates.
 */
export async function runRerankEval(
  cases: EvalCase[],
  call: ModelCaller,
  opts: RunEvalOptions,
): Promise<EvalReport> {
  const system = buildRoofingSystemPrompt();
  const results: EvalCaseResult[] = [];

  for (const c of cases) {
    const user = renderEvalUserPrompt(c);
    const out = await call({ system, user, evalCase: c });
    const grade = gradeCase(out, c);
    results.push({
      da_text: c.da_text,
      council: c.council,
      predicted: out.score,
      expected: c.expected_score,
      why: out.why,
      confidence: out.confidence,
      grade,
    });
  }

  const metrics = precisionRecallF1(
    results.map((r) => ({ predicted: r.predicted, expected: r.expected })),
    opts.threshold,
  );

  const within1Rate = rate(results.map((r) => r.grade.within1));
  const precisionTarget = opts.precisionTarget ?? PRECISION_TARGET;
  const recallTarget = opts.recallTarget ?? RECALL_TARGET;

  return {
    model: opts.model,
    threshold: opts.threshold,
    n: results.length,
    metrics,
    assertions: {
      within1Rate,
      keywordRate: rate(results.map((r) => r.grade.keywordHit)),
      schemaValidRate: rate(results.map((r) => r.grade.schemaValid)),
      within1Pass: within1Rate >= 0.8,
    },
    gate: {
      precisionTarget,
      recallTarget,
      passed: meetsGate(metrics, precisionTarget, recallTarget),
    },
    cases: results,
  };
}
