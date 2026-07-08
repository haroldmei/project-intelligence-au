// PCC ingest runner — links Construction Certificates to their DAs (issue #13).
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
//
// Runs AFTER the DA ingest so the DAs a CC references already exist. For each of
// the 15 NSW LGAs it fetches the day's Construction Certificates (pcc.ts) and
// links each back to its `DevelopmentApplication` by (relatedApplicationId,
// council), stamping `constructionCertifiedAt` — the "work starting now" signal.
//
// A CC whose related DA/CDC we never ingested (out of our 15 LGAs, older than
// our window, or a feed we don't cover) has nothing to attach to and is counted
// as `unmatched` — NOT written as a new DA. v1 links Construction Certificates
// only; OC/SC are already filtered out in the adapter.
//
// Deliberately does NOT write to `ingestion_log`: that table's drift check
// (ingest.ts `checkDrift`) averages daCount per council across sourceApis, so a
// CC-link count logged under a council slug would corrupt DA drift detection.
// PCC observability rides on structured pino logs + the returned result instead.
import { db } from "@/lib/db";
import pino from "pino";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { NSW_REGIONS } from "./jurisdictions/config";
import { namespaceCdcDaId } from "./cdc";
import { fetchCouncilPccs, type RawPccRecord } from "./pcc";

const log = pino({ name: "pcc-ingest" });

/** Whether one CC found a DA to attach to, or had nothing matching. */
export type PccLinkOutcome = "linked" | "unmatched";

export interface PccIngestResult {
  /** Total CCs fetched across all councils. */
  fetched: number;
  /** CCs successfully linked to an existing DA. */
  linked: number;
  /** CCs with no matching DA in our store (skipped, not created). */
  unmatched: number;
  /** True when the flag/key gate short-circuited the run (no fetch happened). */
  skipped: boolean;
}

/**
 * Link one Construction Certificate to its related application, stamping
 * `constructionCertifiedAt`. Keyed on the (da_id, council) unique — a CC's
 * related reference is the DA/CDC number, and the certificate is issued by the
 * same council, so the pair is unambiguous.
 *
 * `updateMany` (not `update`) so a not-found link is a `count: 0` result, never
 * a thrown P2025 — the not-found path is expected (most CCs reference DAs
 * outside our 15 LGAs or window). Exported so the unit suite can exercise both
 * the found and not-found branches directly.
 */
export async function linkCertificate(cc: RawPccRecord): Promise<PccLinkOutcome> {
  const { count } = await db.developmentApplication.updateMany({
    where: {
      daId: { in: [cc.relatedApplicationId, namespaceCdcDaId(cc.relatedApplicationId)] },
      council: cc.council,
    },
    data: { constructionCertifiedAt: new Date(cc.issuedDate) },
  });
  return count > 0 ? "linked" : "unmatched";
}

/**
 * Ingest Construction Certificates for every NSW LGA and link them to their DAs.
 *
 * No-op (returns `{ skipped: true }`) unless BOTH `PCC_INGEST_ENABLED` and
 * `NSW_PLANNING_API_KEY` are set — the same gate the DA Online-API adapter uses,
 * so the feed stays dark until a subscription key lands. One council failing is
 * isolated (logged to Sentry) and never blocks the others.
 */
export async function runPccIngest(sinceDaysBack = 1): Promise<PccIngestResult> {
  if (!env.PCC_INGEST_ENABLED || !env.NSW_PLANNING_API_KEY) {
    log.info(
      { pccEnabled: env.PCC_INGEST_ENABLED, hasKey: Boolean(env.NSW_PLANNING_API_KEY) },
      "[pcc] skipped — PCC_INGEST_ENABLED and NSW_PLANNING_API_KEY both required",
    );
    return { fetched: 0, linked: 0, unmatched: 0, skipped: true };
  }

  let fetched = 0;
  let linked = 0;
  let unmatched = 0;

  for (const council of NSW_REGIONS) {
    try {
      const certificates = await fetchCouncilPccs(council, sinceDaysBack);
      fetched += certificates.length;
      for (const cc of certificates) {
        const outcome = await linkCertificate(cc);
        if (outcome === "linked") linked++;
        else unmatched++;
      }
      log.info(
        { council, fetched: certificates.length },
        "[pcc] council done",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ council, err: msg }, "[pcc] council failed");
      Sentry.captureException(err, { tags: { council, phase: "pcc-ingest" } });
    }
  }

  log.info({ fetched, linked, unmatched }, "[pcc] run complete");
  return { fetched, linked, unmatched, skipped: false };
}
