// Lead-class classifier — issue #14.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Honest repositioning (docs/24 §2.1, §4): DA data structurally MISSES most
// like-for-like re-roofs — they're exempt development under Codes SEPP 2008
// s2.53(c) and never surface as a DA. Rather than imply the digest catches all
// re-roof work, we sort every surfaced lead into one of three classes the data
// genuinely supports:
//
//   fast_track       — CDC records (complying development): tile→metal
//                      re-roofs and pattern-book approvals.
//   strata_heritage  — class-2 upgrades, heritage re-roofs, high-value
//                      remediation.
//   builder_pipeline — new-build / alterations-&-additions DAs; win via the
//                      head contractor. The default when nothing more specific
//                      matches (ambiguous leads land here — issue #14).
//
// PURE + DETERMINISTIC: rules over the approval pathway plus the
// description / raw-scope / development-type text. No DB, no env, no clock —
// every input maps to exactly one class, so the class persisted on DigestDa at
// assembly time stays stable across re-runs and history reads.
//
// The pathway input is OPTIONAL: NSW feeds don't expose one today (the CDC
// ingest + `approvalPathway` field arrives with #10), so classification
// currently runs keyword-only and upgrades automatically once the pathway is
// populated.

export type LeadClass = "builder_pipeline" | "fast_track" | "strata_heritage";

/** Every lead class — canonical set for guards / exhaustiveness. */
export const LEAD_CLASSES: readonly LeadClass[] = [
  "fast_track",
  "strata_heritage",
  "builder_pipeline",
] as const;

/**
 * Digest grouping order (issue #14): fast-track first (fastest to win), then
 * strata & heritage (highest value), then the builder pipeline (the long game
 * via the head contractor). Rank order is preserved *within* each group.
 */
export const LEAD_CLASS_GROUP_ORDER: readonly LeadClass[] = [
  "fast_track",
  "strata_heritage",
  "builder_pipeline",
] as const;

export interface LeadClassMeta {
  /** Short badge label shown on digest cards. */
  label: string;
  /** One-line explanation for group headers / tooltips. */
  blurb: string;
}

export const LEAD_CLASS_META: Record<LeadClass, LeadClassMeta> = {
  fast_track: {
    label: "Fast-track",
    blurb: "CDC approvals — tile→metal re-roofs and pattern-book jobs.",
  },
  strata_heritage: {
    label: "Strata & heritage",
    blurb: "Class-2 upgrades, heritage re-roofs and high-value remediation.",
  },
  builder_pipeline: {
    label: "Builder pipeline",
    blurb: "New-build and alterations-&-additions — win via the head contractor.",
  },
};

export interface LeadClassInput {
  /**
   * Planning pathway when the feed exposes one — NSW CDC / "Complying
   * Development", or SA's `assessmentpathway` (#28). Optional: NSW DAs carry no
   * pathway until the #10 CDC ingest lands, so this is null/undefined today.
   */
  approvalPathway?: string | null;
  description?: string | null;
  rawScopeText?: string | null;
  /** Council "Type of development" category (#26), when present. */
  developmentType?: string | null;
}

// ── Keyword vocabularies ──────────────────────────────────────────────────
// All terms are pre-normalised (lowercase, single-spaced, "&" → "and") to
// match against a normalised haystack. Phrase terms match on word boundaries
// because the haystack (and every term) is space-padded before comparison.

/**
 * Strata & heritage markers. Checked FIRST and with the highest precedence:
 * heritage items are legally excluded from complying development, so a heritage
 * signal must beat a CDC signal rather than be shadowed by it.
 */
const STRATA_HERITAGE_TERMS: readonly string[] = [
  "heritage",
  "conservation area",
  "strata",
  "class 2",
  "class two",
  "residential flat building",
  "remediation",
  "cladding",
];

/** Explicit CDC / fast-track markers in the free-text scope or category. */
const FAST_TRACK_TERMS: readonly string[] = [
  "complying development",
  "complying development certificate",
  "cdc",
  "pattern book",
  "fast track",
];

/**
 * Fast-track markers on the pathway field specifically. Kept narrow — SA's
 * "Code Assessed" pathway is NOT complying development and must not map here.
 */
const FAST_TRACK_PATHWAY_TERMS: readonly string[] = [
  "complying",
  "cdc",
];

/**
 * Explicit builder-pipeline markers. Not required for classification (this is
 * the fallback class) but documents the intended positive matches and lets the
 * tests assert them rather than relying only on the default.
 */
const BUILDER_PIPELINE_TERMS: readonly string[] = [
  "alterations and additions",
  "alterations additions",
  "new dwelling",
  "new residence",
  "dual occupancy",
  "secondary dwelling",
];

function normalize(s: string | null | undefined): string {
  if (!s) return " ";
  const cleaned = s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Space-pad so single-word terms match on boundaries via `includes`.
  return ` ${cleaned} `;
}

function containsAny(paddedHaystack: string, terms: readonly string[]): boolean {
  return terms.some((term) => paddedHaystack.includes(` ${term} `));
}

/**
 * Classify one lead into a lead class. Pure: same input → same output.
 * Precedence: strata & heritage → fast-track (CDC) → builder pipeline (default).
 */
export function classifyLeadClass(input: LeadClassInput): LeadClass {
  const pathway = normalize(input.approvalPathway);
  const text = normalize(
    [input.description, input.rawScopeText, input.developmentType]
      .filter((v): v is string => Boolean(v))
      .join(" "),
  );

  // 1. Strata & heritage wins outright (see STRATA_HERITAGE_TERMS rationale).
  if (containsAny(text, STRATA_HERITAGE_TERMS)) return "strata_heritage";

  // 2. Fast-track — CDC pathway, or an explicit CDC / pattern-book mention.
  if (containsAny(pathway, FAST_TRACK_PATHWAY_TERMS)) return "fast_track";
  if (containsAny(text, FAST_TRACK_TERMS)) return "fast_track";

  // 3. Default — the builder pipeline. Ambiguous DAs land here (issue #14).
  return "builder_pipeline";
}

/** Type guard for a raw string read back from the DB. */
export function isLeadClass(v: string): v is LeadClass {
  return (LEAD_CLASSES as readonly string[]).includes(v);
}

/** Coerce a persisted/nullable value to a LeadClass, defaulting to the pipeline. */
export function toLeadClass(v: string | null | undefined): LeadClass {
  return v != null && isLeadClass(v) ? v : "builder_pipeline";
}

/**
 * Group items by lead class in {@link LEAD_CLASS_GROUP_ORDER}, preserving the
 * original (rank) order within each group. Stable: items of the same class keep
 * their relative order. Used by the email digest to render grouped sections.
 */
export function groupByLeadClass<T extends { leadClass: LeadClass }>(items: T[]): T[] {
  const groupIndex = new Map<LeadClass, number>(
    LEAD_CLASS_GROUP_ORDER.map((c, i) => [c, i]),
  );
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ga = groupIndex.get(a.item.leadClass) ?? LEAD_CLASS_GROUP_ORDER.length;
      const gb = groupIndex.get(b.item.leadClass) ?? LEAD_CLASS_GROUP_ORDER.length;
      return ga !== gb ? ga - gb : a.i - b.i;
    })
    .map((x) => x.item);
}

export { BUILDER_PIPELINE_TERMS, STRATA_HERITAGE_TERMS, FAST_TRACK_TERMS };
