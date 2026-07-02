// Unit tests for the BOM warnings feed parser (#20).
// Fixture: src/modules/weather/fixtures/bom-nsw-warnings.xml — a synthetic BOM
// NSW warnings RSS with a severe thunderstorm, a severe weather, a flood (to be
// dropped) and a pubDate-less severe thunderstorm item. No live network.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWarnings } from "./parse";

const FIXTURE = readFileSync(join(__dirname, "fixtures", "bom-nsw-warnings.xml"), "utf-8");

describe("parseWarnings", () => {
  const warnings = parseWarnings(FIXTURE);

  it("keeps only severe thunderstorm / severe weather items (drops the flood)", () => {
    expect(warnings.map((w) => w.id).sort()).toEqual(["IDN21031", "IDN21033", "IDN21040"]);
  });

  it("classifies warning types from the title", () => {
    const byId = Object.fromEntries(warnings.map((w) => [w.id, w]));
    expect(byId["IDN21031"].type).toBe("severe_thunderstorm");
    expect(byId["IDN21033"].type).toBe("severe_weather");
    expect(byId["IDN21040"].type).toBe("severe_thunderstorm");
  });

  it("derives the warning id from the product code in the link", () => {
    expect(warnings.every((w) => /^IDN\d{5}$/.test(w.id))).toBe(true);
  });

  it("parses the issue time as a Date, null when pubDate is absent", () => {
    const byId = Object.fromEntries(warnings.map((w) => [w.id, w]));
    expect(byId["IDN21031"].issuedAt).toBeInstanceOf(Date);
    expect(byId["IDN21031"].issuedAt?.toISOString()).toBe("2026-01-15T04:35:00.000Z");
    expect(byId["IDN21040"].issuedAt).toBeNull();
  });

  it("captures the affected-area text (title tail + description)", () => {
    const w = warnings.find((x) => x.id === "IDN21031")!;
    expect(w.areas.join(" ").toLowerCase()).toContain("sydney metropolitan");
    expect(w.url).toBe("http://www.bom.gov.au/products/IDN21031.html");
  });

  it("returns [] for empty or garbage input rather than throwing", () => {
    expect(parseWarnings("")).toEqual([]);
    expect(parseWarnings("not xml at all <<<")).toEqual([]);
    expect(parseWarnings("<rss><channel></channel></rss>")).toEqual([]);
  });

  it("dedupes repeated ids within a single feed", () => {
    const doubled = `<rss><channel>
      <item><title>Severe Thunderstorm Warning for Sydney Metropolitan</title>
        <link>http://www.bom.gov.au/products/IDN21031.html</link>
        <guid>http://www.bom.gov.au/products/IDN21031.html</guid></item>
      <item><title>Severe Thunderstorm Warning for Sydney Metropolitan</title>
        <link>http://www.bom.gov.au/products/IDN21031.html</link>
        <guid>http://www.bom.gov.au/products/IDN21031.html</guid></item>
    </channel></rss>`;
    expect(parseWarnings(doubled)).toHaveLength(1);
  });
});
