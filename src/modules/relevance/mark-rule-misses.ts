// Post-ingest sweep — persist rule-pass misses for recall-audit stratification.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-004 (§10) | issue #221
//
// FR-004 acceptance criterion 4 requires DAs that FAIL the roofing keyword rule
// pass to be persisted with rule_filtered_out=true 'for recall audit purposes'.
// The rule pass itself (filters.ts) only SELECTs matching DAs; this sweep fills
// in the misses so the eval harness's 'misses' stratum (labelling.ts:48-49)
// samples rule-pass false negatives rather than status-excluded (refused/WD) DAs.
//
// Semantics of excluded_reason on development_applications:
//   null                — not excluded (ruleFilteredOut = false)
//   'rule_filter_miss'  — failed the roofing keyword rule pass
//   'refused_withdrawn' — determined Refused/Withdrawn (status exclusion)
import { db } from "@/lib/db";
import { ALL_COUNCIL_SLUGS } from "@/modules/ingestion/ingest";
import { buildTsQuery } from "./filters";

export interface MarkRulePassMissesResult {
  /** Count of DAs newly marked as rule-pass misses. */
  marked: number;
  /** Count of DAs un-marked because they now match (vocabulary drift recovery). */
  unmarked: number;
}

/**
 * Full sweep over the 15 subscribed NSW councils: mark DAs that fail the roofing
 * keyword tsquery as `rule_filtered_out=true, excluded_reason='rule_filter_miss'`,
 * AND revert DAs that were previously marked as misses but now match the tsquery
 * (vocabulary drift recovery).
 *
 * Idempotent — safe to run every night after ingestion. Only affects DAs in
 * the 15 subscribed council slugs; never touches DAs with a different
 * `excluded_reason` (e.g. `refused_withdrawn`).
 */
export async function markRulePassMisses(): Promise<MarkRulePassMissesResult> {
  const tsQuery = buildTsQuery();

  // Step 1: Mark DAs in subscribed councils that fail the roofing tsquery.
  // Only affects DAs currently not excluded (ruleFilteredOut = false), so it
  // never overwrites a refused/withdrawn or already-marked miss.
  const marked = Number(
    await db.$executeRaw`
      UPDATE development_applications
      SET rule_filtered_out = true, excluded_reason = 'rule_filter_miss'
      WHERE council = ANY(${ALL_COUNCIL_SLUGS})
        AND rule_filtered_out = false
        AND NOT (
          to_tsvector('english',
            coalesce(description, '') || ' ' || coalesce(raw_scope_text, '')
          ) @@ to_tsquery('english', ${tsQuery})
        )
    `,
  );

  // Step 2: Un-mark DAs that were rule-pass misses but now match the tsquery.
  // Handles vocabulary drift — if a keyword was added to the pack that matches
  // a previously-missed DA, it should re-enter the candidate pool.
  const unmarked = Number(
    await db.$executeRaw`
      UPDATE development_applications
      SET rule_filtered_out = false, excluded_reason = NULL
      WHERE excluded_reason = 'rule_filter_miss'
        AND to_tsvector('english',
          coalesce(description, '') || ' ' || coalesce(raw_scope_text, '')
        ) @@ to_tsquery('english', ${tsQuery})
    `,
  );

  return { marked, unmarked };
}
