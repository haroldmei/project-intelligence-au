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

  // Field-level parity for GET /api/cron/ingest (issue #112): the handler always
  // runs runPccIngest and returns a `pcc` object, but the response schema had
  // omitted it. Pin every key of the object literal so the doc can't re-drift.
  // Also pins the `ruleMiss` response field (issue #221).
  it("documents the ingest response `pcc` and `ruleMiss` objects and their keys (issue #112, #221)", () => {
    const route = readFileSync(
      path.resolve(process.cwd(), "src/app/api/cron/ingest/route.ts"),
      "utf8",
    );
    // Sanity: the route really does return the pcc + ruleMiss objects we're documenting.
    expect(route).toContain("pcc: { linked: pcc.linked, unmatched: pcc.unmatched, skipped: pcc.skipped }");
    expect(route).toContain("ruleMiss");
    for (const key of ["pcc", "pcc.linked", "pcc.unmatched", "pcc.skipped", "ruleMiss"]) {
      expect(doc, `docs/07-api-reference.md must document the \`${key}\` response field`).toContain(
        `\`${key}\``,
      );
    }
  });

  // CDC ingest pathway parity for GET /api/cron/ingest (issue #182): CDC records
  // are ingested ADDITIVELY on every nightly run and the flag defaults ON, yet
  // the reference documented only the opt-in, default-OFF PCC flag — inverted
  // priority for exactly the feed most likely to surprise an operator. Pin the
  // doc to name the flag with its default-on semantics + key dependency, and
  // prove the default-on claim from source so the two can't drift.
  it("documents the default-on CDC ingest pathway and CDC_INGEST_ENABLED (issue #182)", () => {
    const cdc = readFileSync(
      path.resolve(process.cwd(), "src/modules/ingestion/cdc.ts"),
      "utf8",
    );
    // Prove default-on from source: the flag is disabled ONLY by an explicit
    // "false"/"0"; anything else (including unset) is enabled. If this ever flips
    // to opt-in, the doc's "Default ON" wording must change with it.
    expect(
      cdc,
      "cdc.ts isCdcIngestEnabled() must treat the flag as default-on (disabled only by explicit false/0)",
    ).toContain(`return v !== "false" && v !== "0";`);

    // The reference must name the flag, its default-on semantics, and the key it
    // reuses — the two operator questions the doc previously couldn't answer.
    expect(doc, "docs must name CDC_INGEST_ENABLED (issue #182)").toContain("CDC_INGEST_ENABLED");
    expect(doc, "docs must state the CDC feed defaults ON").toMatch(/Default\s+\*?\*?ON/i);
    expect(
      doc,
      "docs must state the CDC feed reuses NSW_PLANNING_API_KEY",
    ).toContain("NSW_PLANNING_API_KEY");
    // The pathway itself must appear in the ingest step, not just the flag name.
    expect(doc, "docs must document the `cdc` approval pathway").toContain(`approvalPathway: "cdc"`);
  });

  // Field-level parity for GET /api/cron/digest (issue #108): the handler runs
  // two Sunday ticks and returns `resumed`/`unserved` (idempotent-resume design,
  // issue #12), but the reference documented a single tick and a 5-field body.
  // Pin every key of the object literal so the doc can't re-drift.
  it("documents the digest response keys and both Sunday ticks (issue #108)", () => {
    const route = readFileSync(
      path.resolve(process.cwd(), "src/app/api/cron/digest/route.ts"),
      "utf8",
    );
    // Sanity: the route really returns the seven keys we're documenting.
    for (const key of [
      "resumed",
      "users_processed",
      "sent",
      "failed",
      "unserved",
      "run_id",
      "duration_ms",
    ]) {
      expect(route, `digest route must return \`${key}\``).toContain(`${key}:`);
      expect(
        doc,
        `docs/07-api-reference.md must document the \`${key}\` response field`,
      ).toContain(`\`${key}\``);
    }
    // Both Sunday ticks must be named (primary 07:00 + resume retry 10:00 UTC).
    expect(doc).toContain("07:00 UTC");
    expect(doc).toContain("10:00 UTC");
  });

  // Session-cookie name parity (issue #136): the reference named the cookie
  // `lucia_session`, but the code never overrides Lucia's default, so the real
  // cookie is `auth_session`. Anyone debugging auth or writing a health check by
  // inspecting cookies would look for a name that does not exist. Pin the doc to
  // the name Lucia actually emits, and prove that name from the source: the
  // sessionCookie config must set no `name`, so Lucia's default applies.
  it("documents the real Lucia session cookie name `auth_session` (issue #136)", () => {
    const lucia = readFileSync(
      path.resolve(process.cwd(), "src/lib/auth/lucia.ts"),
      "utf8",
    );
    // The sessionCookie config must NOT override the name — else this test would
    // be asserting the wrong literal. If a name is ever set, update the doc + here.
    const sessionCookieBlock = lucia.slice(lucia.indexOf("sessionCookie:"));
    expect(
      sessionCookieBlock,
      "lucia.ts must not set sessionCookie.name (Lucia default `auth_session` applies)",
    ).not.toMatch(/name\s*:/);

    // Doc uses the real name and no longer references the fictional one.
    expect(doc).toContain("auth_session");
    expect(
      doc.includes("lucia_session"),
      "docs/07-api-reference.md must not name the cookie `lucia_session` — the real name is `auth_session`",
    ).toBe(false);
  });
});
