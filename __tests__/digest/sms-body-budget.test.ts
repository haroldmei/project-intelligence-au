// Regression for issue #135: the Sunday SMS must carry all three top-3 leads
// whenever they fit inside FR-011's budget of ≤ 3 concatenated parts (≤ 480
// chars). buildSmsBody used to self-cap at 320 (2 parts) and, when three cards
// plus their short links crossed that, silently dropped the lowest-ranked card
// — so an SMS-opted paying user routinely got only 2 of the 3 leads even though
// all 3 fit comfortably inside the FR's 480-char limit.
//
// FR-011 AC: "SMS contains 3 DA summaries ... ≤ 3 concatenated parts (≤ 480
// characters total)." These tests assert the 3rd lead survives for any body
// that stays within 480, and that the last-resort card-drop still fires only
// when even a truncated body would blow past 480.
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

describe("buildSmsBody — FR-011 480-char / 3-part budget", () => {
  it("keeps all three top-3 leads when the 3-line body fits within 480 chars", () => {
    // Three realistic cards: 40-char addresses, a short value, distinct portal
    // URLs. With a 34-char app URL this body lands ~355 chars — over the old
    // 320 cap (which would have dropped the 3rd card) but well under 480.
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
    expect(body.length).toBeLessThanOrEqual(480);
    // ...but past the retired 320 cap, so this is a genuine regression guard:
    // the old code would have hit the drop branch here.
    expect(body.length).toBeGreaterThan(320);
  });

  it("drops the lowest-ranked card only when even a truncated body exceeds 480", () => {
    // Values aren't truncated (only addresses are), so oversized values force
    // the body past 480 even after the 40-char address fallback — the last
    // resort must still shed the lowest-ranked card to protect the budget.
    // ~70-char value: three lines blow past 480, two lines fit.
    const bigValue = "AUD 1,234,567 estimated construction cost".padEnd(70, "x");
    const cards = [
      { address: addr(60), lga: "Inner West", value: bigValue, portalUrl: "https://council.example/da/2001" },
      { address: addr(60), lga: "Inner West", value: bigValue, portalUrl: "https://council.example/da/2002" },
      { address: addr(60), lga: "Inner West", value: bigValue, portalUrl: "https://council.example/da/2003" },
    ];

    const body = buildSmsBody(cards, ["Inner West"], "5 Jul 2026");

    expect(body.length).toBeLessThanOrEqual(480);
    expect(numberedLines(body).length).toBeLessThan(3);
    expect(numberedLines(body).length).toBeGreaterThanOrEqual(1);
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
});
