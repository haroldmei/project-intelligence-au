// Guards the env.ts "single source of truth" claim (#94): every var shipped in
// .env.production.example must be declared in the schema, and BOM_WARNINGS_URL
// — read at call time by the storm-brief feed — must live in the schema too.
// This mirrors the drift check in scripts/check-env.ts as a hard test so a
// used-but-undeclared override can't slip back in.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ENV_VARS } from "@/lib/env";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Var names assigned in a dotenv template, matching check-env.ts's parser. */
function readTemplate(relPath: string): string[] {
  const full = path.join(REPO_ROOT, relPath);
  if (!existsSync(full)) return [];
  const names: string[] = [];
  for (const line of readFileSync(full, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
    if (m) names.push(m[1]);
  }
  return names;
}

describe("env schema is the single source of truth", () => {
  const declared = new Set(ENV_VARS.map((v) => v.name));

  it("declares BOM_WARNINGS_URL (used by the storm-brief feed) as an optional var", () => {
    const entry = ENV_VARS.find((v) => v.name === "BOM_WARNINGS_URL");
    expect(entry).toBeDefined();
    expect(entry?.required).toBe(false);
  });

  it("declares every var shipped in .env.production.example", () => {
    const templateVars = readTemplate(".env.production.example");
    expect(templateVars.length).toBeGreaterThan(0);
    const unknown = templateVars.filter((name) => !declared.has(name));
    expect(unknown).toEqual([]);
  });
});
