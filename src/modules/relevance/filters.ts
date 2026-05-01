// Stage 1: prefilter SQL — roofing keyword GIN tsvector + LGA bundle + value range.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-004 | system-design §2 relevance component, §3.4 vector/embedding tables
//
// Implements PipelineDeps.ruleFilter for runRelevancePipeline.
// Uses Prisma raw query for full-text GIN tsvector (@@) which Prisma ORM doesn't support natively.
import { db } from "@/lib/db";
import type { CandidateDA } from "@/lib/ai/relevance-pipeline";

/**
 * Vocabulary used in the GIN tsvector rule pass (FR-004). Two tiers:
 *
 * - Explicit roofing terms: re-roof, colorbond, gutters, etc. These match
 *   DAs that *literally* call out roofing scope.
 *
 * - Roofing-implicit construction terms: dwelling, residential, alterations,
 *   single storey, dual occupancy, additions. These match DAs where roofing
 *   work is implicit (every new dwelling needs a roof; every alteration to
 *   an existing roof line probably does too). The Stage-3 LLM rerank scores
 *   each candidate 0–5 against the user's saved query, so non-relevant
 *   construction DAs get demoted before the digest fires — Stage 1 just has
 *   to surface candidates with plausible roofing scope.
 *
 * If precision drops below the 0.85 target, narrow this list back down.
 */
const ROOFING_KEYWORDS = [
  // Tier 1 — explicit roofing
  "roof",
  "roofing",
  "re-roof",
  "reroof",
  "metal roof",
  "colorbond",
  "colour bond",
  "membrane",
  "gutters",
  "downpipes",
  "skylights",
  "roof tiles",
  "roof replacement",
  "roof restoration",
  "roof repair",
  "insulation",
  "fascia",
  "barge",
  "ridge cap",
  "hip and ridge",
  "sarking",
  "rooflight",
  // Tier 2 — roofing-implicit construction (new builds, alterations)
  "dwelling",
  "residential",
  "alterations",
  "additions",
  "alterations and additions",
  "construction of",
  "single storey",
  "two storey",
  "dual occupancy",
  "secondary dwelling",
].map((k) => k.toLowerCase());

/**
 * Build the PostgreSQL tsquery string: keywords joined with |
 * E.g. "roof | colorbond | membrane | ..."
 */
function buildTsQuery(): string {
  return ROOFING_KEYWORDS.map((k) => k.replace(/\s+/g, "<->")).join(" | ");
}

/**
 * Stage 1 rule filter: returns DAs from the past `sinceDaysBack` days that
 * match the roofing tsvector query and belong to the user's subscribed councils.
 *
 * Uses raw SQL for the tsvector @@ operator (FR-004, system-design §3.1 indexing).
 * The GIN index on (description || ' ' || raw_scope_text) is assumed to exist
 * per system-design §3.1.
 */
export async function ruleFilter({
  councilSlugs,
  sinceIsoDate,
  excludeDaIds,
}: {
  userId: string;
  councilSlugs: string[];
  sinceIsoDate: string;
  excludeDaIds?: string[];
}): Promise<CandidateDA[]> {
  if (councilSlugs.length === 0) return [];

  const tsQuery = buildTsQuery();
  // Pass [""] when there's nothing to exclude so the parameter is non-empty
  // for ANY() — Postgres rejects ANY(empty array) with a type error. The
  // sentinel "" never matches a real DA id (cuids are length-25), so the
  // NOT (id = ANY(...)) clause is a no-op when excludeDaIds is empty.
  const exclude = excludeDaIds && excludeDaIds.length > 0 ? excludeDaIds : [""];

  // Prisma raw query — necessary for tsvector @@ operator.
  // Parameterised to prevent injection.
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      da_id: string;
      council: string;
      address: string;
      description: string;
      raw_scope_text: string | null;
      estimated_value: string | null;
      lodgement_date: Date;
      applicant_name: string | null;
      portal_url: string;
    }>
  >`
    SELECT
      id,
      da_id,
      council,
      address,
      description,
      raw_scope_text,
      estimated_value::text,
      lodgement_date,
      applicant_name,
      portal_url
    FROM development_applications
    WHERE
      council = ANY(${councilSlugs})
      AND lodgement_date >= ${new Date(sinceIsoDate)}::date
      AND rule_filtered_out = false
      AND NOT (id = ANY(${exclude}))
      AND to_tsvector('english', coalesce(description,'') || ' ' || coalesce(raw_scope_text,''))
            @@ to_tsquery('english', ${tsQuery})
    ORDER BY lodgement_date DESC
    LIMIT 500
  `;

  return rows.map((r) => ({
    daId: r.id, // use internal id for joins
    council: r.council,
    address: r.address,
    description: r.description,
    rawScopeText: r.raw_scope_text,
    estimatedValue: r.estimated_value ? Number(r.estimated_value) : null,
    lodgementDate: r.lodgement_date.toISOString().slice(0, 10),
    applicantName: r.applicant_name,
    portalUrl: r.portal_url,
  }));
}

export { ROOFING_KEYWORDS, buildTsQuery };
