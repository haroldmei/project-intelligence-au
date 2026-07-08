// Unit tests for the digest CSV export (issue #22).
// Pure functions — no DB. Covers escaping edge cases, empty digest, filename,
// and a full round-trip through an independent RFC 4180 parser (the acceptance
// check: a field containing `", \n` must survive as valid CSV).
import { describe, it, expect } from "vitest";
import { csvField, buildDigestCsv, csvFilename } from "@/modules/digest/export";
import type { DigestDetail, DigestCard } from "@/modules/portal/loaders";

function card(overrides: Partial<DigestCard> = {}): DigestCard {
  return {
    daId: "da_1",
    rank: 1,
    relevanceScore: 0.87,
    whyMatched: "Matches your roofing scope",
    leadClass: "builder_pipeline",
    constructionCertifiedAt: null,
    address: "1 Smith St, Newtown NSW 2042",
    council: "Inner West",
    estimatedValue: 250000,
    portalUrl: "https://portal.example/da/1",
    applicantName: "Acme Builders",
    description: "New pitched roof",
    lodgementDate: "2026-06-30",
    userFeedback: null,
    ...overrides,
  };
}

function digest(cards: DigestCard[], runDate = "2026-07-05"): DigestDetail {
  return {
    id: "dg_1",
    sentAt: "2026-07-05T09:00:00.000Z",
    daCount: cards.length,
    emailStatus: "sent",
    smsStatus: null,
    areaLabel: "Western Sydney",
    fallbackUsed: false,
    runDate,
    leadClassCounts: { fast_track: 0, strata_heritage: 0, builder_pipeline: cards.length },
    cards,
  };
}

/**
 * Minimal RFC 4180 parser (independent of the writer) — returns rows of fields.
 * Used to prove the writer's output round-trips; deliberately not shared code.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const push = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    push();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      push();
      i++;
      continue;
    }
    if (c === "\r" && text[i + 1] === "\n") {
      endRow();
      i += 2;
      continue;
    }
    if (c === "\n" || c === "\r") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Flush any trailing partial field/row (none expected — writer ends on CRLF).
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

describe("csvField escaping", () => {
  it("leaves plain values unquoted", () => {
    expect(csvField("Newtown")).toBe("Newtown");
    expect(csvField("1 Smith St")).toBe("1 Smith St");
  });

  it("renders nullish as empty string", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("stringifies numbers without quoting", () => {
    expect(csvField(250000)).toBe("250000");
    expect(csvField(0.87)).toBe("0.87");
    expect(csvField(0)).toBe("0");
  });

  it("quotes fields containing a comma", () => {
    expect(csvField("Smith St, Newtown")).toBe('"Smith St, Newtown"');
  });

  it("quotes and doubles embedded double quotes", () => {
    expect(csvField('a "quoted" word')).toBe('"a ""quoted"" word"');
  });

  it("quotes fields containing newlines or carriage returns", () => {
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  describe("neutralises spreadsheet formula injection (CSV injection, OWASP)", () => {
    // A field a spreadsheet must NOT evaluate as a formula: leading trigger char
    // neutralised. csvField('=1+1') must not begin with =/+/-/@/tab/CR.
    it("does not leave a formula-trigger char at the start of the cell", () => {
      for (const payload of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1"]) {
        expect(csvField(payload)).not.toMatch(/^[=+\-@\t\r]/);
      }
    });

    it("prefixes a single quote so the value opens as inert text", () => {
      expect(csvField("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
      expect(csvField("+1+1")).toBe("'+1+1");
      expect(csvField("-2+3")).toBe("'-2+3");
      expect(csvField("@import")).toBe("'@import");
    });

    it("neutralises inside RFC 4180 quoting when the payload also needs quoting", () => {
      // `=HYPERLINK("http://evil","lead")` contains a comma and quotes, so it is
      // both formula-injection AND needs RFC quoting. The apostrophe must land
      // first, then the whole thing is quote-wrapped.
      const payload = '=HYPERLINK("http://evil","lead")';
      const out = csvField(payload);
      expect(out.startsWith('"\'=')).toBe(true); // opening quote, then apostrophe
      // Round-trips back to the neutralised (apostrophe-prefixed) text.
      expect(parseCsv(out)[0][0]).toBe(`'${payload}`);
    });

    it("leaves non-triggering values unchanged (no false positives)", () => {
      for (const safe of ["Newtown", "1 Smith St", "New pitched roof", "0.87", "e=mc2"]) {
        expect(csvField(safe)).toBe(safe);
      }
    });

    it("never prefixes numeric fields (negative estimates round-trip)", () => {
      expect(csvField(-5)).toBe("-5");
      expect(csvField(250000)).toBe("250000");
    });
  });

  it("handles the acceptance string `\", \\n`", () => {
    const raw = '", \n';
    const escaped = csvField(raw);
    // Quote wrapped, internal quote doubled, comma+newline preserved inside.
    expect(escaped).toBe('"""' + ", \n" + '"');
    // And it round-trips through the parser.
    expect(parseCsv(escaped)[0][0]).toBe(raw);
  });
});

describe("buildDigestCsv", () => {
  it("emits a header-only document for an empty digest", () => {
    const csv = buildDigestCsv(digest([]));
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("Address");
    expect(rows[0]).toContain("Your Rating");
  });

  it("emits one row per lead with all columns", () => {
    const csv = buildDigestCsv(digest([card(), card({ daId: "da_2" })]));
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3); // header + 2
    expect(rows[1][0]).toBe("1 Smith St, Newtown NSW 2042");
    expect(rows[1]).toHaveLength(10);
  });

  it("maps user feedback to a readable rating", () => {
    const csv = buildDigestCsv(
      digest([
        card({ daId: "a", userFeedback: "up" }),
        card({ daId: "b", userFeedback: "down" }),
        card({ daId: "c", userFeedback: null }),
      ]),
    );
    const rows = parseCsv(csv);
    expect(rows[1].at(-1)).toBe("Thumbs up");
    expect(rows[2].at(-1)).toBe("Thumbs down");
    expect(rows[3].at(-1)).toBe("");
  });

  it("includes approval pathway when present, blank otherwise", () => {
    const withPathway = parseCsv(
      buildDigestCsv(digest([card({ approvalPathway: "Complying Development" })])),
    );
    expect(withPathway[1][2]).toBe("Complying Development");
    const without = parseCsv(buildDigestCsv(digest([card()])));
    expect(without[1][2]).toBe("");
  });

  it("round-trips a description containing quotes, commas and newlines", () => {
    const nasty = 'Reroof: remove tiles, install "Colorbond"\nthen flash valleys';
    const csv = buildDigestCsv(
      digest([card({ description: nasty, whyMatched: 'why, "quoted", ok' })]),
    );
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2); // header + 1 — embedded newline did NOT split rows
    expect(rows[1][7]).toBe(nasty); // Description column
    expect(rows[1][6]).toBe('why, "quoted", ok'); // Why This Matched column
  });

  it("neutralises a formula-injection payload in a free-text DA field", () => {
    // A council-sourced description an applicant controls. On open, Excel must
    // not evaluate it. After export the Description cell must not begin with a
    // formula-trigger char; address/whyMatched get the same guard.
    const csv = buildDigestCsv(
      digest([
        card({
          description: '=HYPERLINK("http://evil","lead")',
          address: "=cmd|'/c calc'!A1",
          whyMatched: "@SUM(1+1)",
          council: "-2+3",
        }),
      ]),
    );
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2); // header + 1 row (payload did not break structure)
    const [address, council] = [rows[1][0], rows[1][1]];
    const whyMatched = rows[1][6];
    const description = rows[1][7];
    for (const cell of [address, council, whyMatched, description]) {
      expect(cell).not.toMatch(/^[=+\-@\t\r]/);
    }
    // The apostrophe is the neutralising marker — payload text is otherwise intact.
    expect(description).toBe('\'=HYPERLINK("http://evil","lead")');
  });

  it("blanks a null estimated value", () => {
    const rows = parseCsv(buildDigestCsv(digest([card({ estimatedValue: null })])));
    expect(rows[1][3]).toBe("");
  });
});

describe("csvFilename", () => {
  it("builds the pi-au-digest-<date>.csv name", () => {
    expect(csvFilename("2026-07-05")).toBe("pi-au-digest-2026-07-05.csv");
  });

  it("truncates a timestamp to the date", () => {
    expect(csvFilename("2026-07-05T09:00:00.000Z")).toBe("pi-au-digest-2026-07-05.csv");
  });
});
