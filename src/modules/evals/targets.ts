// Eval target = one (vertical, jurisdiction) gold set (issue #31). The rerank
// eval machinery (#19) was single-trade/single-region (roofing/NSW); this module
// is the pure naming + discovery layer that lets every future (trade, region)
// launch inherit the same GA gate against its own labelled set.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Pure — NO DB, NO fs, NO @/lib/env. Path *strings* are computed here; the
// actual reads/writes live in the scripts. Filename discovery is fed a plain
// list of names so it stays unit-testable without a filesystem. Safe to import
// from the always-on jsdom suite.

/** The V1 wedge target — roofing in NSW. The default when an axis is unspecified. */
export const DEFAULT_VERTICAL = "roofing";
export const DEFAULT_JURISDICTION = "nsw";

/** A single gold set to evaluate: one trade in one region. */
export interface EvalTarget {
  vertical: string;
  jurisdiction: string;
}

/** `<vertical>-<jurisdiction>.jsonl` — the on-disk dataset name for a target. */
export function datasetFilename(t: EvalTarget): string {
  return `${t.vertical}-${t.jurisdiction}.jsonl`;
}

/** `<vertical>-<jurisdiction>-<date>.json` — the dated result name for a run. */
export function resultFilename(t: EvalTarget, isoDate: string): string {
  return `${t.vertical}-${t.jurisdiction}-${isoDate}.json`;
}

/**
 * Parse a dataset filename back into a target, or null if it isn't a
 * `<vertical>-<jurisdiction>.jsonl` name. The jurisdiction is the segment after
 * the LAST hyphen (jurisdiction ids are single tokens — `nsw`, `sa`); the
 * vertical is everything before it, so a hyphenated trade slug survives.
 */
export function parseDatasetFilename(name: string): EvalTarget | null {
  const m = /^(.+)-([^-]+)\.jsonl$/.exec(name);
  if (!m) return null;
  return { vertical: m[1], jurisdiction: m[2] };
}

/**
 * Every (vertical, jurisdiction) that has a dataset file, discovered from a
 * directory listing. Sorted by vertical then jurisdiction for a stable summary
 * table. `eval-results` (a directory, no `.jsonl` suffix) and any other name is
 * ignored. Pure: the caller supplies the filenames.
 */
export function discoverTargets(filenames: string[]): EvalTarget[] {
  return filenames
    .map(parseDatasetFilename)
    .filter((t): t is EvalTarget => t !== null)
    .sort((a, b) =>
      a.vertical === b.vertical
        ? a.jurisdiction.localeCompare(b.jurisdiction)
        : a.vertical.localeCompare(b.vertical),
    );
}

/** Human label for logs / the summary table. */
export function targetLabel(t: EvalTarget): string {
  return `${t.vertical}/${t.jurisdiction}`;
}
