// Rerank system-prompt composition for vertical packs (#30).
// Locks the demolition composition (shared scaffold + pack fragment) as a
// snapshot so an accidental scaffold edit is caught, plus structural asserts.
import { describe, expect, it } from "vitest";
import { composeRerankSystemPrompt } from "./rerank-prompt";
import { demolitionPack } from "./demolition";
import { DEMOLITION_RERANK_FRAGMENT } from "./demolition/prompt";

describe("composeRerankSystemPrompt(demolitionPack)", () => {
  const prompt = composeRerankSystemPrompt(demolitionPack);

  it("substitutes the trade label into the shared scaffold", () => {
    expect(prompt).toContain("Sydney demolition subcontractors");
  });

  it("embeds the pack's rubric fragment verbatim", () => {
    expect(prompt).toContain(DEMOLITION_RERANK_FRAGMENT.trim());
  });

  it("keeps the locked scaffold sections in order: schema → rubric → confidence → do-nots", () => {
    const iSchema = prompt.indexOf("## Output schema (strict JSON)");
    const iRubric = prompt.indexOf("## Relevance rubric (0–5) — demolition");
    const iConf = prompt.indexOf("## Confidence");
    const iDont = prompt.indexOf("## What you MUST NOT do");
    expect(iSchema).toBeGreaterThanOrEqual(0);
    expect(iRubric).toBeGreaterThan(iSchema);
    expect(iConf).toBeGreaterThan(iRubric);
    expect(iDont).toBeGreaterThan(iConf);
  });

  it("carries the demolition-specific strip-out guard", () => {
    expect(prompt).toContain("Strip-out is not demolition");
  });

  it("matches the composition snapshot", () => {
    expect(prompt).toMatchSnapshot();
  });
});
