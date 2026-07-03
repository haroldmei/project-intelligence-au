// Ground-truth labelling DB logic (issue #19). The interactive prompts live in
// scripts/label-das.ts; the queries + writes live here so they can be tested
// against the docker test DB without a TTY.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_VERTICAL, DEFAULT_JURISDICTION } from "./targets";

/** Minimal DA shape the labelling CLI presents to a human. */
export interface UnlabelledDa {
  id: string;
  daId: string;
  council: string;
  address: string;
  description: string;
  rawScopeText: string | null;
  estimatedValue: number | null;
  ruleFilteredOut: boolean;
}

const DA_SELECT = {
  id: true,
  daId: true,
  council: true,
  address: true,
  description: true,
  rawScopeText: true,
  estimatedValue: true,
  ruleFilteredOut: true,
} as const;

function toUnlabelled(rows: Array<Record<string, unknown>>): UnlabelledDa[] {
  return rows.map((r) => ({
    id: r.id as string,
    daId: r.daId as string,
    council: r.council as string,
    address: r.address as string,
    description: r.description as string,
    rawScopeText: (r.rawScopeText as string | null) ?? null,
    estimatedValue: r.estimatedValue == null ? null : Number(r.estimatedValue),
    ruleFilteredOut: r.ruleFilteredOut as boolean,
  }));
}

/**
 * DAs not yet labelled *by this labeller for this vertical*, split by the rule
 * filter so the gold set stays stratified across rule-filter hits
 * (ruleFilteredOut=false) AND misses (ruleFilteredOut=true) — labelling only the
 * hits would blind the eval to false negatives the rule pass drops.
 *
 * Scoped to `jurisdiction` (the DA's own region) and to the `vertical` on the
 * "already labelled" check, so labelling the same DA for a second trade surfaces
 * it again rather than treating a roofing label as covering demolition (#31).
 */
export async function selectUnlabelledStratified(
  db: PrismaClient,
  args: {
    labelledBy: string;
    limitPerStratum: number;
    vertical?: string;
    jurisdiction?: string;
  },
): Promise<{ hits: UnlabelledDa[]; misses: UnlabelledDa[] }> {
  const vertical = args.vertical ?? DEFAULT_VERTICAL;
  const jurisdiction = args.jurisdiction ?? DEFAULT_JURISDICTION;
  const base = {
    jurisdiction,
    groundTruth: { none: { labelledBy: args.labelledBy, vertical } },
  };
  const [hits, misses] = await Promise.all([
    db.developmentApplication.findMany({
      where: { ...base, ruleFilteredOut: false },
      select: DA_SELECT,
      orderBy: { ingestedAt: "desc" },
      take: args.limitPerStratum,
    }),
    db.developmentApplication.findMany({
      where: { ...base, ruleFilteredOut: true },
      select: DA_SELECT,
      orderBy: { ingestedAt: "desc" },
      take: args.limitPerStratum,
    }),
  ]);
  return { hits: toUnlabelled(hits), misses: toUnlabelled(misses) };
}

export interface LabelInput {
  daId: string;
  council: string;
  isRelevant: boolean;
  labelledBy: string;
  source?: string;
  /** (trade, region) the label is made under (#31); default roofing/nsw. */
  vertical?: string;
  jurisdiction?: string;
}

/**
 * Record (or overwrite) one label. Idempotent per (daId, labelledBy) via upsert
 * — re-labelling the same DA corrects the earlier call rather than duplicating.
 * The (vertical, jurisdiction) it was made under is stamped on the row (#31).
 */
export async function recordLabel(db: PrismaClient, input: LabelInput): Promise<void> {
  const source = input.source ?? "manual";
  const vertical = input.vertical ?? DEFAULT_VERTICAL;
  const jurisdiction = input.jurisdiction ?? DEFAULT_JURISDICTION;
  await db.daGroundTruth.upsert({
    where: { daId_labelledBy: { daId: input.daId, labelledBy: input.labelledBy } },
    create: {
      daId: input.daId,
      council: input.council,
      isRelevant: input.isRelevant,
      labelledBy: input.labelledBy,
      source,
      vertical,
      jurisdiction,
    },
    update: { isRelevant: input.isRelevant, source, vertical, jurisdiction },
  });
}

export interface ThumbImportResult {
  imported: number;
  skipped: number;
}

/**
 * Import DaFeedback thumbs as *candidate* ground-truth labels flagged
 * `source=thumb`, for human review before they count toward the gate. A
 * thumbs-up → relevant, thumbs-down → irrelevant, labeller = `thumb:<userId>`
 * so each user's thumb sits alongside a founder's manual label on the same DA
 * without colliding. Idempotent (upsert); an existing MANUAL label for the same
 * (DA, labeller) key is never clobbered by a thumb.
 */
export async function importThumbsAsCandidates(
  db: PrismaClient,
  args: { limit?: number; vertical?: string; jurisdiction?: string } = {},
): Promise<ThumbImportResult> {
  const vertical = args.vertical ?? DEFAULT_VERTICAL;
  const jurisdiction = args.jurisdiction ?? DEFAULT_JURISDICTION;
  const feedback = await db.daFeedback.findMany({
    orderBy: { createdAt: "desc" },
    take: args.limit,
    include: { da: { select: { council: true } } },
  });

  let imported = 0;
  let skipped = 0;
  for (const f of feedback) {
    const labelledBy = `thumb:${f.userId}`;
    const existing = await db.daGroundTruth.findUnique({
      where: { daId_labelledBy: { daId: f.daId, labelledBy } },
    });
    // Never overwrite a reviewed manual label with a raw thumb.
    if (existing && existing.source === "manual") {
      skipped++;
      continue;
    }
    await db.daGroundTruth.upsert({
      where: { daId_labelledBy: { daId: f.daId, labelledBy } },
      create: {
        daId: f.daId,
        council: f.da.council,
        isRelevant: f.feedback === "up",
        labelledBy,
        source: "thumb",
        vertical,
        jurisdiction,
      },
      update: { isRelevant: f.feedback === "up", source: "thumb", vertical, jurisdiction },
    });
    imported++;
  }
  return { imported, skipped };
}

/**
 * Ground-truth rows joined to their DA, shaped for scripts/export-eval-set.ts.
 * Scoped to one (vertical, jurisdiction) so each gold set exports to its own
 * `<vertical>-<jurisdiction>.jsonl` (#31); defaults to the roofing/nsw wedge.
 */
export async function loadGroundTruthForExport(
  db: PrismaClient,
  args: { includeThumbs?: boolean; vertical?: string; jurisdiction?: string } = {},
): Promise<
  Array<{
    daId: string;
    council: string;
    lgaSlug: string | null;
    isRelevant: boolean;
    source: string;
    description: string;
    estimatedValue: number | null;
  }>
> {
  const rows = await db.daGroundTruth.findMany({
    where: {
      vertical: args.vertical ?? DEFAULT_VERTICAL,
      jurisdiction: args.jurisdiction ?? DEFAULT_JURISDICTION,
      ...(args.includeThumbs ? {} : { source: "manual" }),
    },
    include: {
      da: { select: { description: true, estimatedValue: true, lgaId: true } },
    },
    orderBy: { labelledAt: "asc" },
  });
  return rows.map((r) => ({
    daId: r.daId,
    council: r.council,
    lgaSlug: r.da.lgaId,
    isRelevant: r.isRelevant,
    source: r.source,
    description: r.da.description,
    estimatedValue: r.da.estimatedValue == null ? null : Number(r.da.estimatedValue),
  }));
}
