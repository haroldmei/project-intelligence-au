// BOM severe-weather warning feed parser for the storm brief (#20).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// FEED CHOICE (v1): the Bureau of Meteorology public **NSW Warnings RSS**
// (www.bom.gov.au/rss/ — see src/modules/weather/feed.ts for the exact URL).
// Why RSS over the anonymous-FTP XML products (IDN*/IDZ*) or CAP:
//   - It is a single stable document listing *all current* NSW warnings, so one
//     GET per cron tick covers every warning type — no per-product polling.
//   - RSS 2.0 is a frozen, unambiguous schema; the XML warning products change
//     shape between product types (amoc/thunderstorm vs. flood).
//   - Each <item> already carries a stable warning id (the IDN##### product
//     code in the link), the warning type (title), issue time (pubDate) and the
//     affected-area text (title tail + description) we need.
// Attribution: BOM data is © Bureau of Meteorology; the brief email credits it.
//
// This module is PURE (cheerio only — no @/lib/env, no network, no db) so it
// runs in the always-on fe vitest suite and inside the node cron alike.
import * as cheerio from "cheerio";
import type { StormWarning, WarningType } from "./types";

/** BOM product codes look like "IDN21031" — three letters + five digits. */
const PRODUCT_CODE_RE = /\b([A-Z]{3}\d{5})\b/;

/**
 * Classify a warning by its title. Only severe thunderstorm / severe weather
 * warnings drive a roofing storm brief (issue #20 scope); flood, marine,
 * fire-weather, damaging-surf etc. are dropped.
 */
function classify(title: string): WarningType | null {
  const t = title.toLowerCase();
  if (t.includes("severe thunderstorm")) return "severe_thunderstorm";
  // "severe weather warning" — but NOT the flood/marine variants that also
  // contain the word "warning".
  if (t.includes("severe weather")) return "severe_weather";
  return null;
}

/** Derive a stable warning id from the item link/guid, falling back to the URL. */
function warningId(link: string, guid: string): string {
  const code = link.match(PRODUCT_CODE_RE) ?? guid.match(PRODUCT_CODE_RE);
  if (code) return code[1];
  // No product code — use the guid (or link) verbatim so dedupe still works.
  return (guid || link).trim();
}

/** The affected-area text: the title's "…for X" tail plus the description body. */
function extractAreas(title: string, description: string): string[] {
  const areas: string[] = [];
  const forIdx = title.toLowerCase().indexOf(" for ");
  if (forIdx !== -1) areas.push(title.slice(forIdx + 5).trim());
  if (description.trim()) areas.push(description.trim());
  return areas;
}

/**
 * Parse a BOM NSW warnings RSS document into severe-thunderstorm / severe-weather
 * warnings. Tolerant of malformed input (returns [] rather than throwing) and of
 * non-severe items (silently skipped). Never touches the network.
 */
export function parseWarnings(xml: string): StormWarning[] {
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(xml, { xmlMode: true });
  } catch {
    return [];
  }

  const warnings: StormWarning[] = [];
  const seen = new Set<string>();

  $("item").each((_, el) => {
    const item = $(el);
    const title = item.find("title").first().text().trim();
    if (!title) return;

    const type = classify(title);
    if (!type) return; // not a roofing-relevant warning

    const link = item.find("link").first().text().trim();
    const guid = item.find("guid").first().text().trim();
    const id = warningId(link, guid);
    if (!id || seen.has(id)) return; // one warning per id within a feed
    seen.add(id);

    const description = item.find("description").first().text();
    const pubDate = item.find("pubDate").first().text().trim();
    const parsed = pubDate ? new Date(pubDate) : null;
    const issuedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

    warnings.push({
      id,
      type,
      title,
      issuedAt,
      areas: extractAreas(title, description),
      url: link || guid,
    });
  });

  return warnings;
}
