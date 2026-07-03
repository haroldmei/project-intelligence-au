// Guard: docs/07-api-reference.md must document every public API route (issue #46).
//
// The API reference is the canonical contract an auditor or integrator reads
// first. It previously drifted: the Spam-Act unsubscribe, the Privacy-Act
// erasure route, and the #22 CSV export had all shipped but were undocumented.
// This test enumerates every src/app/api/**/route.ts and asserts a matching
// endpoint path appears in the reference, so the two can never silently diverge.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const API_DIR = path.resolve(process.cwd(), "src/app/api");
const DOC_PATH = path.resolve(process.cwd(), "docs/07-api-reference.md");

// Map a route file to the canonical endpoint path the docs must contain, e.g.
//   src/app/api/unsubscribe/[token]/route.ts -> /unsubscribe/{token}
//   src/app/api/export/digest/[id]/route.ts  -> /export/digest/{id}
// Dynamic segments [x] are normalised to {x} to match the doc convention.
function routeFileToDocPath(relFile: string): string {
  const dir = path.dirname(relFile); // strip trailing /route.ts
  const normalised = dir.replace(/\[([^\]]+)\]/g, "{$1}");
  return "/" + normalised.split(path.sep).join("/");
}

function listRouteFiles(): string[] {
  return readdirSync(API_DIR, { recursive: true })
    .map((p) => String(p))
    .filter((p) => p.endsWith("route.ts"))
    .map((p) => p.split(path.sep).join("/"))
    .sort();
}

describe("docs/07-api-reference.md route coverage", () => {
  const doc = readFileSync(DOC_PATH, "utf8");
  const routeFiles = listRouteFiles();

  it("finds route files to check", () => {
    // Sanity: the enumeration itself must not silently pass on an empty set.
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  it("documents every src/app/api/**/route.ts endpoint", () => {
    const missing = routeFiles.filter((rel) => !doc.includes(routeFileToDocPath(rel)));
    expect(
      missing,
      `Undocumented API routes (add an entry to docs/07-api-reference.md):\n` +
        missing.map((m) => `  ${m} -> ${routeFileToDocPath(m)}`).join("\n"),
    ).toEqual([]);
  });

  // The three compliance/buyer-facing routes that regressed in #46 — pinned
  // individually so a regression names them explicitly, not just "one missing".
  it.each([
    ["/account/delete", "GDPR/Privacy Act right to erasure"],
    ["/unsubscribe/{token}", "Spam Act one-click email opt-out"],
    ["/export/digest/{id}", "issue #22 buyer-facing CSV export"],
  ])("documents %s (%s)", (docPath) => {
    expect(doc.includes(docPath)).toBe(true);
  });
});
