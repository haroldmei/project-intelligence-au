// BOM affected-area → LGA keyword map for the storm brief (#20).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// v1 matching is a static keyword map (issue #20 scope: "a static keyword map
// of BOM district/area names → LGA ids is acceptable for v1; keep it a data
// file"). BOM severe-weather / severe-thunderstorm warnings name affected areas
// as forecast districts ("Sydney Metropolitan") and representative
// towns/suburbs ("Parramatta", "Penrith", "Cronulla"). We lowercase the
// warning's area text and test each keyword as a substring; a hit adds that
// keyword's LGA ids.
//
// This is intentionally pure (no @/lib/env, no db) so it runs in the always-on
// fe vitest suite and inside the node cron alike.
import { NSW_REGIONS } from "@/modules/ingestion/jurisdictions/config";

/** The canonical 15 roofing-wedge LGA ids (Western/Inner/Northern/Southern Sydney). */
export const ALL_LGA_IDS: readonly string[] = NSW_REGIONS;
const ALL_LGA_SET = new Set(ALL_LGA_IDS);

/**
 * Display names for the 15 wedge LGAs (matches prisma/seed.ts). Kept here so the
 * storm-brief email can label a user's affected areas without a DB join.
 */
export const LGA_NAMES: Record<string, string> = {
  blacktown: "Blacktown",
  cumberland: "Cumberland",
  parramatta: "Parramatta",
  penrith: "Penrith",
  the_hills: "The Hills",
  burwood: "Burwood",
  canada_bay: "Canada Bay",
  city_of_sydney: "City of Sydney",
  inner_west: "Inner West",
  hornsby: "Hornsby",
  ku_ring_gai: "Ku-ring-gai",
  northern_beaches: "Northern Beaches",
  bayside: "Bayside",
  georges_river: "Georges River",
  sutherland: "Sutherland",
};

/** Human-readable names for a list of LGA ids, in canonical order. */
export function lgaNames(ids: string[]): string[] {
  const set = new Set(ids);
  return ALL_LGA_IDS.filter((id) => set.has(id)).map((id) => LGA_NAMES[id] ?? id);
}

/**
 * Keyword (lowercased) → LGA ids it implies. A warning covering the whole
 * Sydney basin ("Sydney Metropolitan" / "metropolitan") hits every wedge LGA;
 * a warning naming a specific town maps to the LGA that contains it.
 *
 * Keep bare-suburb keywords specific enough to avoid cross-LGA false positives.
 * We deliberately do NOT map bare "sydney" (it appears inside "Sydney
 * Metropolitan" and would over-match); the whole-basin districts below cover it.
 */
export const BOM_AREA_TO_LGAS: Record<string, readonly string[]> = {
  // ── Whole-of-Sydney forecast districts → all 15 wedge LGAs ──────────────
  "sydney metropolitan": ALL_LGA_IDS,
  "metropolitan": ALL_LGA_IDS,
  "sydney metro": ALL_LGA_IDS,
  "greater sydney": ALL_LGA_IDS,

  // ── Western Sydney ───────────────────────────────────────────────────────
  "blacktown": ["blacktown"],
  "mount druitt": ["blacktown"],
  "cumberland": ["cumberland"],
  "merrylands": ["cumberland"],
  "auburn": ["cumberland"],
  "parramatta": ["parramatta"],
  "penrith": ["penrith"],
  "st marys": ["penrith"],
  "the hills": ["the_hills"],
  "hills shire": ["the_hills"],
  "castle hill": ["the_hills"],
  "baulkham hills": ["the_hills"],

  // ── Inner West & City ────────────────────────────────────────────────────
  "burwood": ["burwood"],
  "canada bay": ["canada_bay"],
  "five dock": ["canada_bay"],
  "city of sydney": ["city_of_sydney"],
  "sydney cbd": ["city_of_sydney"],
  "inner west": ["inner_west"],
  "marrickville": ["inner_west"],
  "leichhardt": ["inner_west"],

  // ── Northern Sydney ──────────────────────────────────────────────────────
  "hornsby": ["hornsby"],
  "ku-ring-gai": ["ku_ring_gai"],
  "ku ring gai": ["ku_ring_gai"],
  "gordon": ["ku_ring_gai"],
  "northern beaches": ["northern_beaches"],
  "manly": ["northern_beaches"],
  "warringah": ["northern_beaches"],

  // ── Southern Sydney ──────────────────────────────────────────────────────
  "bayside": ["bayside"],
  "rockdale": ["bayside"],
  "georges river": ["georges_river"],
  "hurstville": ["georges_river"],
  "kogarah": ["georges_river"],
  "sutherland": ["sutherland"],
  "sutherland shire": ["sutherland"],
  "cronulla": ["sutherland"],
};

/**
 * Map BOM affected-area strings to wedge LGA ids. Case-insensitive substring
 * match against the keyword map. Returns the deduped, canonical-ordered list of
 * LGA ids the warning touches (empty if none of our 15 are affected).
 */
export function matchLgas(areas: string[]): string[] {
  const hit = new Set<string>();
  for (const area of areas) {
    const haystack = area.toLowerCase();
    for (const [keyword, lgaIds] of Object.entries(BOM_AREA_TO_LGAS)) {
      if (haystack.includes(keyword)) {
        for (const id of lgaIds) {
          if (ALL_LGA_SET.has(id)) hit.add(id);
        }
      }
    }
  }
  // Return in canonical NSW_REGIONS order for stable output/tests.
  return ALL_LGA_IDS.filter((id) => hit.has(id));
}
