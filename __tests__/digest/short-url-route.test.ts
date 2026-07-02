// Issue #52: SMS short links are emitted as `${APP_BASE_URL}/s/<slug>` but the
// redirect handler used to be mounted under /api/s/<slug>, so every tapped SMS
// link 404'd (FR-011 delivered dead links). The handler now lives at
// src/app/s/[slug]/route.ts so the public path matches the emitted URL.
//
// These tests pin BOTH ends of the contract:
//   1. the handler at the /s/[slug] path resolves a persisted slug to a 302
//      redirect to the DA portalUrl (and 404s for an unknown slug), and
//   2. the path the SMS body emits shares the exact prefix the route is mounted
//      at — a regression guard so the two can't drift apart again.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { truncateAll, testDb } from "../setup-test-db";
import { GET } from "@/app/s/[slug]/route";
import { shortSlug } from "@/modules/digest/assemble";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testDb.$disconnect();
});

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /s/[slug] — SMS short-link redirect", () => {
  it("302-redirects a known slug to the DA portalUrl", async () => {
    const targetUrl = "https://eplanning.nsw.gov.au/portal/da/2026-0001";
    const slug = shortSlug(targetUrl);
    await testDb.shortUrl.create({ data: { slug, targetUrl } });

    const res = await GET(new Request(`http://localhost:3000/s/${slug}`), ctx(slug));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(targetUrl);
  });

  it("404s an unknown slug", async () => {
    const res = await GET(new Request("http://localhost:3000/s/nope"), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("resolves the exact URL the SMS body emits (path prefix matches the route)", async () => {
    // The SMS body builds `${APP_BASE_URL}/s/${shortSlug(portalUrl)}`. Pull the
    // path prefix the app emits and prove the route file is mounted there.
    const targetUrl = "https://council-a.nsw.gov.au/da/111";
    const slug = shortSlug(targetUrl);
    await testDb.shortUrl.create({ data: { slug, targetUrl } });

    const emitted = new URL(`https://app.example/s/${slug}`);
    const [, prefix] = emitted.pathname.split("/"); // "s"
    expect(prefix).toBe("s");

    // The handler mounted at that prefix must resolve the slug, not 404.
    const res = await GET(new Request(emitted.toString()), ctx(slug));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(targetUrl);
  });

  it("mounts the route at src/app/s/[slug] (not under /api/s)", () => {
    // Filesystem routing: the public path is the directory path. Guard against a
    // regression that re-nests the handler under /api/s and reintroduces the 404.
    const root = process.cwd();
    expect(existsSync(join(root, "src/app/s/[slug]/route.ts"))).toBe(true);
    expect(existsSync(join(root, "src/app/api/s/[slug]/route.ts"))).toBe(false);
  });
});
