// Stage 1: prefilter SQL — roofing keyword GIN tsvector + LGA bundle + value range.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-004 | system-design §2 relevance component, §3.4 vector/embedding tables
//
// Implements PipelineDeps.ruleFilter for runRelevancePipeline.
// Uses Prisma raw query for full-text GIN tsvector (@@) which Prisma ORM doesn't support natively.
import { db } from "@/lib/db";
import type { CandidateDA } from "@/lib/ai/relevance-pipeline";
import { getPack, packTsQuery, type VerticalPack } from "@/verticals";

// The rule-pass vocabulary now lives in the roofing vertical pack (#27) — this
// module owns none of it. We resolve `roofing` through the registry (its only
// always-on entry) rather than importing the pack directly, so every trade
// flows through the same seam. See src/verticals/roofing/vocabulary.ts.
function roofingPack(): VerticalPack {
  const pack = getPack("roofing");
  if (!pack) throw new Error("[filters] roofing vertical pack is not registered");
  return pack;
}

/**
 * Two-tier vocabulary of the active trade, re-exported for tests/tooling. The
 * data is owned by the vertical pack (FR-004): tier 1 explicit terms match DAs
 * that literally call out the trade's scope; tier 2 implicit construction terms
 * match DAs where the work is implied. The Stage-3 LLM rerank demotes the false
 * positives, so Stage 1 only has to surface plausible candidates.
 */
const ROOFING_KEYWORDS: string[] = [
  ...roofingPack().vocabulary.explicit,
  ...roofingPack().vocabulary.implicit,
];

/**
 * Build the PostgreSQL tsquery string from the active pack's vocabulary:
 * terms joined with | and phrase-linked with <-> (see packTsQuery).
 */
function buildTsQuery(): string {
  return packTsQuery(roofingPack());
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
