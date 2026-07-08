// Regression for issue #135: the Sunday SMS must carry all three top-3 leads
// whenever they fit inside FR-011's budget of ≤ 3 concatenated segments (≤ 459
// GSM-7 chars). buildSmsBody used to self-cap at 320 (2 parts) and, when three
// cards plus their short links crossed that, silently dropped the lowest-ranked
// card — so an SMS-opted paying user routinely got only 2 of the 3 leads even
// though all 3 fit comfortably inside a single 459-char GSM-7 budget.
//
// FR-011 AC: "SMS contains 3 DA summaries ... ≤ 3 concatenated parts."
// These tests assert the 3rd lead survives for any body that stays within the
// encoding-aware budget, and that the last-resort card-drop still fires only
// when even a truncated body would blow past the cap.
//
// Issue #237 fix: the old '…' (U+2026) truncation marker forced UCS-2 encoding
// on the truncated path, blowing the segment budget. Replaced with GSM-7-safe
// '..' and the GSM-7/UCS-2 max chars are now encoding-aware.
import { describe, it, expect, vi } from "vitest";

// buildSmsBody captures APP_BASE_URL = env.NEXT_PUBLIC_APP_URL at module load.
// Pin a realistic-length (34-char) app URL BEFORE the module graph imports env,
// so the short-link lines are the real size a production SMS would carry — a
// localhost URL would understate them and hide the regression.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.projectintelligence.au"; // 34 chars
  // env.ts requires a valid DATABASE_URL at import; supply a dummy (db is
  // mocked below, so nothing ever connects) for environments where it's unset.
  process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
});

// assemble.ts pulls in db/email/analytics at import; stub them so importing
// buildSmsBody has no side effects. (sms/client is a pure string module but we
// mock it too so the sender-id/footer constants are stable for the assertions.)
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email/client", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/sms/client", () => ({
  sendSms: vi.fn(),
  SMS_SENDER_ID: "PI-AU",
  SMS_STOP_FOOTER: "Reply STOP to opt out.",
}));
vi.mock("@/lib/analytics/server", () => ({ captureServer: vi.fn() }));

import { buildSmsBody } from "@/modules/digest/assemble";

// Build a string of exactly `n` chars from a realistic address seed.
const addr = (n: number) =>
  "123 Longview Terrace, Marrickville NSW".padEnd(n, "x").slice(0, n);

const numberedLines = (body: string) =>
  body.split("\n").filter((l) => /^\d+\.\s/.test(l));

describe("buildSmsBody — FR-011 encoding-aware GSM-7/UCS-2 3-segment budget", () => {
  it("keeps all three top-3 leads when the 3-line body fits within 459 GSM-7 chars", () => {
    // Three realistic cards: 40-char addresses, a short value, distinct portal
    // URLs. With a 34-char app URL this body lands ~355 chars — over the old
    // 320 cap (which would have dropped the 3rd card) but well under 459.
    const cards = [
      { address: addr(40), lga: "Inner West", value: "AUD 180k", portalUrl: "https://council.example/da/1001" },
      { address: addr(40), lga: "Inner West", value: "AUD 240k", portalUrl: "https://council.example/da/1002" },
      { address: addr(40), lga: "Inner West", value: "AUD 95k", portalUrl: "https://council.example/da/1003" },
    ];

    const body = buildSmsBody(cards, ["Inner West", "Marrickville", "Newtown"], "5 Jul 2026");

    expect(numberedLines(body)).toHaveLength(3);
    expect(body).toMatch(/^1\.\s/m);
    expect(body).toMatch(/^2\.\s/m);
    expect(body).toMatch(/^3\.\s/m);
    // Within FR-011's budget...
    expect(body.length).toBeLessThanOrEqual(459);
    // ...but past the retired 320 cap, so this is a genuine regression guard:
    // the old code would have hit the drop branch here.
    expect(body.length).toBeGreaterThan(320);
  });

  it("drops the lowest-ranked card only when even a truncated body exceeds 459", () => {
    // Values aren't truncated (only addresses are), so oversized values force
    // the body past 459 even after the 40-char address fallback — the last
    // resort must still shed the lowest-ranked card to protect the budget.
    // ~70-char value: three lines blow past 459, two lines fit.
    const bigValue = "AUD 1,234,567 estimated construction cost".padEnd(70, "x");
    const cards = [
      { address: addr(60), lga: "Inner West", value: bigValue, portalUrl: "https://council.example/da/2001" },
      { address: addr(60), lga: "Inner West", value: bigValue, portalUrl: "https://council.example/da/2002" },
      { address: addr(60), lga: "Inner West", value: bigValue, portalUrl: "https://council.example/da/2003" },
    ];

    const body = buildSmsBody(cards, ["Inner West"], "5 Jul 2026");

    expect(body.length).toBeLessThanOrEqual(459);
    expect(numberedLines(body).length).toBeLessThan(3);
    expect(numberedLines(body).length).toBeGreaterThanOrEqual(1);
  });

  it("includes a scope summary per lead within the 459-char budget (FR-011/UI-003)", () => {
    // Regression for issue #204: the SMS teaser must carry each lead's scope so a
    // tradie can tell a re-roof from a demolition without tapping through.
    const cards = [
      {
        address: addr(40),
        lga: "Inner West",
        value: "AUD 180k",
        scope: "Demolition of existing dwelling and construction of two-storey dwelling",
        portalUrl: "https://council.example/da/1001",
      },
      {
        address: addr(40),
        lga: "Inner West",
        value: "AUD 240k",
        scope: "Re-roofing and replacement of guttering to existing residence",
        portalUrl: "https://council.example/da/1002",
      },
      {
        address: addr(40),
        lga: "Inner West",
        value: "AUD 95k",
        scope: "Rear extension and internal alterations to dwelling",
        portalUrl: "https://council.example/da/1003",
      },
    ];

    const body = buildSmsBody(cards, ["Inner West"], "5 Jul 2026");

    // Every lead still present, still within FR-011's budget...
    expect(numberedLines(body)).toHaveLength(3);
    expect(body.length).toBeLessThanOrEqual(459);
    // ...and each line carries scope-derived text that distinguishes the jobs.
    expect(body).toMatch(/Demolition/);
    expect(body).toMatch(/Re-?roof/i);
    expect(body).toMatch(/extension/i);
    // Format is `[Address] | [Scope] | [Value] | link` — scope sits between the
    // address and the value, so a scoped line has at least two ` | ` separators.
    for (const line of numberedLines(body)) {
      expect(line.split(" | ").length).toBeGreaterThanOrEqual(3);
    }
  });

  it("caps the scope to ≤ 20 words per lead (FR-011)", () => {
    const longScope = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const cards = [
      {
        address: addr(30),
        lga: "Inner West",
        value: "AUD 100k",
        scope: longScope,
        portalUrl: "https://council.example/da/4001",
      },
    ];

    const body = buildSmsBody(cards, ["Inner West"], "5 Jul 2026");
    const line = numberedLines(body)[0];
    const scopeSeg = line.split(" | ")[1] ?? "";
    // Word-limited (≤ 20) and char-capped, so nowhere near the 40-word input.
    const wordCount = scopeSeg.replace(/\.\.$/, "").trim().split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(20);
    expect(scopeSeg.length).toBeLessThanOrEqual(44);
  });

  it("drops a lead but keeps scope on the survivors when scoped leads blow the budget", () => {
    // Three fully-scoped, long-address, big-value leads can't all fit with scope;
    // the fix must shed the lowest-ranked lead rather than silently drop scope.
    const bigValue = "AUD 1,234,567 estimated construction cost".padEnd(60, "x");
    const scope = "Demolition of existing structures and construction of new dwelling";
    const cards = [
      { address: addr(60), lga: "Inner West", value: bigValue, scope, portalUrl: "https://council.example/da/5001" },
      { address: addr(60), lga: "Inner West", value: bigValue, scope, portalUrl: "https://council.example/da/5002" },
      { address: addr(60), lga: "Inner West", value: bigValue, scope, portalUrl: "https://council.example/da/5003" },
    ];

    const body = buildSmsBody(cards, ["Inner West"], "5 Jul 2026");

    expect(body.length).toBeLessThanOrEqual(459);
    expect(numberedLines(body).length).toBeLessThan(3);
    // Surviving lead(s) still carry the scope — the whole point of the field.
    expect(body).toMatch(/Demolition/);
  });

  it("omits the scope segment gracefully when a lead has no description", () => {
    const cards = [
      { address: addr(40), lga: "Inner West", value: "AUD 180k", scope: "", portalUrl: "https://council.example/da/6001" },
    ];
    const body = buildSmsBody(cards, ["Inner West"], "5 Jul 2026");
    // No empty ` |  | ` gap — just address | value.
    expect(body).not.toMatch(/\|\s+\|/);
    expect(numberedLines(body)).toHaveLength(1);
  });

  it("sends a single over-budget card rather than dropping to an empty body", () => {
    const cards = [
      {
        address: addr(200),
        lga: "Inner West",
        value: "AUD 9,999,999 with an unusually verbose scope description attached",
        portalUrl: "https://council.example/da/3001",
      },
    ];

    const body = buildSmsBody(cards, ["Inner West"], "5 Jul 2026");

    expect(numberedLines(body)).toHaveLength(1);
    expect(body).toMatch(/^1\.\s/m);
  });

  // ─── Acceptance criterion (issue #237) ───────────────────────────────
  // FR-011: ≤ 3 concatenated SMS segments.
  // GSM-7: 153 chars/segment (3 parts = 459).  UCS-2: 67 chars/segment (3 parts = 201).
  // The old '…' (U+2026) truncation marker forced UCS-2 on the truncated
  // path. These tests prove the fix: no U+2026 in any output, and every body
  // fits within its encoding's 3-segment budget.

  describe("issue #237 — GSM-7-safe truncation marker + encoding-aware cap", () => {
    // Check a body against the acceptance criterion: it must (a) contain only
    // characters the code itself emits (no U+2026), (b) fit in ≤3 segments.
    const assertValidSegmentBudget = (body: string) => {
      // (a) code never emits UCS-2-forcing characters
      expect(body).not.toContain("…");
      // (b) GSM-7 → ≤ 459; if source data forces UCS-2 → ≤ 201
      const isGsm7 = [...body].every(
        (ch) =>
          ch === "\n" ||
          ch === "\r" ||
          (ch >= " " && ch <= "_") ||
          (ch >= "a" && ch <= "~") ||
          "¡£¤¥§¿ÄÅÆÇÉÑÖØÜßàäåæçèéìñòöøùüΓΔΘΛΞΠΣΦΨΩ€".includes(ch),
      );
      expect(body.length).toBeLessThanOrEqual(isGsm7 ? 459 : 201);
    };

    it("normal (within-budget) output contains no UCS-2-forcing chars and ≤ 459 GSM-7 chars", () => {
      const body = buildSmsBody(
        [
          { address: addr(40), lga: "Inner West", value: "AUD 180k", portalUrl: "https://ex.co/1" },
          { address: addr(40), lga: "Inner West", value: "AUD 240k", portalUrl: "https://ex.co/2" },
        ],
        ["Inner West"],
        "5 Jul 2026",
      );
      assertValidSegmentBudget(body);
    });

    it("truncated (over-budget pass 2) output uses '..' not '…' and ≤ 459 GSM-7 chars", () => {
      // Addresses long enough to trigger address truncation but fit in 459
      const body = buildSmsBody(
        [
          { address: addr(80), lga: "Inner West", value: "AUD 180k", portalUrl: "https://ex.co/1" },
          { address: addr(80), lga: "Inner West", value: "AUD 240k", portalUrl: "https://ex.co/2" },
          { address: addr(80), lga: "Inner West", value: "AUD 95k", portalUrl: "https://ex.co/3" },
        ],
        ["Inner West"],
        "5 Jul 2026",
      );
      assertValidSegmentBudget(body);
      // The truncation marker should appear for at least one address
      expect(body).toContain("..");
    });

    it("card-drop path never reintroduces U+2026", () => {
      const bigValue = "AUD 1,234,567 estimated cost".padEnd(60, "x");
      const body = buildSmsBody(
        [
          { address: addr(60), lga: "Inner West", value: bigValue, portalUrl: "https://ex.co/1" },
          { address: addr(60), lga: "Inner West", value: bigValue, portalUrl: "https://ex.co/2" },
          { address: addr(60), lga: "Inner West", value: bigValue, portalUrl: "https://ex.co/3" },
        ],
        ["Inner West"],
        "5 Jul 2026",
      );
      assertValidSegmentBudget(body);
    });

    it("scope truncation uses '..' not '…'", () => {
      const longScope = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
      const body = buildSmsBody(
        [
          { address: addr(30), lga: "Inner West", value: "AUD 100k", scope: longScope, portalUrl: "https://ex.co/1" },
        ],
        ["Inner West"],
        "5 Jul 2026",
      );
      assertValidSegmentBudget(body);
      // The scope should have been truncated (40 words → ≤ 20 words, ≤ 44 chars)
      // and the truncation marker should be '..'
      const line = numberedLines(body)[0];
      const scopeSeg = line.split(" | ")[1] ?? "";
      expect(scopeSeg).toMatch(/\.\.$/);
    });

    it("non-GSM-7 char in council address forces UCS-2 cap (≤ 201 chars)", () => {
      // The acceptance criterion: for ANY input the body fits within 3 segments
      // under its actual encoding. When source data contains a non-GSM-7 char
      // (e.g. an en-dash in council address data) the cap must drop to UCS-2.
      const curlyAddr = "123 Main Street – Marrickville NSW"; // en-dash U+2013
      const cards = [
        { address: curlyAddr, lga: "Inner West", value: "AUD 180k", portalUrl: "https://ex.co/1" },
        { address: curlyAddr, lga: "Inner West", value: "AUD 240k", portalUrl: "https://ex.co/2" },
        { address: curlyAddr, lga: "Inner West", value: "AUD 95k", portalUrl: "https://ex.co/3" },
      ];
      const body = buildSmsBody(cards, ["Inner West"], "5 Jul 2026");

      // UCS-2 forced by the address data — must still fit ≤ 201 (3 × 67)
      assertValidSegmentBudget(body);
      // The body should have the en-dash preserved (from source data)
      expect(body).toContain("–");
    });
  });
});
