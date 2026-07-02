// Acceptance test (#30): with VERTICAL_DEMOLITION_ENABLED on, resolve the
// demolition pack through the registry and drive a demolition fixture through
// the full 3-stage relevance pipeline against a MOCKED model client.
//
// Fully hermetic: the Anthropic SDK, the AI cost ledger (its DB writes), and
// @/lib/env are mocked, so this runs in the always-on fe suite with no Postgres
// and no network. The pipeline's Stage-3 rerank (renderUserPrompt +
// parseModelOutput) is the REAL code path — only the model call is stubbed.
//
// NOTE: the live rerank still loads the roofing system prompt from
// src/prompts/rerank.system.md; wiring the pack's own prompt fragment into the
// runtime is the #27 extraction. This test validates that a second trade's DA
// flows end-to-end through the shared machinery — i.e. the pack architecture
// supports trade #2 — which is the acceptance bar for a "built + dormant" pack.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The mocked model client — a spy so we can assert it was exercised.
const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          results: [
            {
              da_id: "demo-fixture-1",
              score: 5,
              why: "Standalone demolition of existing dwelling; site to be left clear.",
              confidence: 0.9,
            },
          ],
        }),
      },
    ],
    usage: { input_tokens: 120, output_tokens: 40 },
  })),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: createMock };
  },
}));

// Stub the env snapshot (rerank.ts imports it) so no real env / DATABASE_URL
// is needed for this pure-logic test.
vi.mock("@/lib/env", () => ({
  env: { ANTHROPIC_API_KEY: "test-key", USD_TO_AUD: 1.52, NODE_ENV: "test" },
}));

// Stub the cost ledger so no Prisma/DB import is pulled in and no row is written.
vi.mock("@/lib/ai/cost-ledger", () => ({
  recordAiCost: vi.fn(async () => {}),
  priceFor: () => 0,
  weekStartAEST: () => new Date(0),
}));

import {
  runRelevancePipeline,
  type CandidateDA,
  type PipelineDeps,
} from "@/lib/ai/relevance-pipeline";
import { getPack } from "../registry";
import { matchesVocabulary } from "../types";

const fixture: CandidateDA = {
  daId: "demo-fixture-1",
  council: "penrith",
  address: "12 Example St, Penrith NSW 2750",
  description:
    "Demolition of existing single-storey dwelling and detached garage; site to be left clear and made safe. Asbestos removal by licensed contractor.",
  rawScopeText: null,
  estimatedValue: 62000,
  lodgementDate: "2026-06-01",
  applicantName: null,
  portalUrl: "https://example.com/da/demo-fixture-1",
};

beforeEach(() => {
  vi.stubEnv("VERTICAL_DEMOLITION_ENABLED", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  createMock.mockClear();
});

describe("demolition pack — full pipeline (flag on, mocked model)", () => {
  it("resolves via the registry and surfaces a demolition DA end-to-end", async () => {
    const pack = getPack("demolition");
    expect(pack).toBeDefined();
    if (!pack) throw new Error("demolition pack did not resolve");

    const deps: PipelineDeps = {
      // Stage 1: the pack's own vocabulary (keyword fallback, pre-#26) decides
      // inclusion — proving the demolition pack drives candidate selection.
      ruleFilter: async () =>
        matchesVocabulary(
          pack,
          `${fixture.description} ${fixture.rawScopeText ?? ""}`,
        )
          ? [fixture]
          : [],
      vectorRank: async ({ candidates }) => candidates,
      loadThumbsExamples: async () => [],
    };

    const out = await runRelevancePipeline(
      {
        userId: "u-demo",
        savedQueryText: pack.defaultSavedQuery,
        savedQueryEmbedding: Array(1536).fill(0),
        userLgaCouncilSlugs: ["penrith"],
      },
      deps,
    );

    // The mocked model client was actually driven (Stage 3 ran).
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(out.stats.ruleFiltered).toBe(1);
    expect(out.stats.rerankSurfaced).toBe(1);
    expect(out.results).toHaveLength(1);
    expect(out.results[0].daId).toBe("demo-fixture-1");
    expect(out.results[0].score).toBe(5);
    expect(out.results[0].candidate.council).toBe("penrith");
    expect(out.results[0].why).toMatch(/demolition/i);
  });

  it("stays dormant when the flag is off — pack not resolvable, model never called", async () => {
    vi.stubEnv("VERTICAL_DEMOLITION_ENABLED", "false");
    expect(getPack("demolition")).toBeUndefined();
    expect(createMock).not.toHaveBeenCalled();
  });
});
