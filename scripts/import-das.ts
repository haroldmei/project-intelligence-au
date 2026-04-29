// Manual DA importer — reads a JSON file of DA records and pushes them
// through the existing ingestion pipeline (development_applications upsert
// + da_embeddings + ingestion_log). Use this while council scrapers are
// still being built (docs/19-deploy-runbook.md, docs/22-pipeline-enable.md).
//
// Usage:
//   pnpm exec tsx --env-file-if-exists=.env.local scripts/import-das.ts data/das/sample-roofing-week.json
//   pnpm exec tsx --env-file-if-exists=.env.local scripts/import-das.ts data/das/sample-roofing-week.json --skip-embeddings
//
// Against production:
//   DATABASE_URL=$(grep '^DATABASE_URL=' .env.production.local | cut -d= -f2-) \
//   OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' .env.production.local | cut -d= -f2-) \
//   pnpm exec tsx scripts/import-das.ts data/das/2026-04-week3.json
//
// The file is a JSON array of DA records — see DaInput below for the shape.
// Idempotent: re-running upserts on (daId, council) and overwrites the
// embedding row, so curating the file and rerunning is safe.

import { readFileSync } from "node:fs";
import { z } from "zod";
import { db } from "@/lib/db";
import { embedBatch } from "@/lib/ai/embeddings";
import { ALL_COUNCIL_SLUGS } from "@/modules/ingestion/ingest";
import pino from "pino";

const log = pino({ name: "import-das" });
const SKIP_EMBEDDINGS_FLAG = "--skip-embeddings";

const DaInputSchema = z.object({
  daId: z.string().min(1),
  council: z.enum(ALL_COUNCIL_SLUGS),
  address: z.string().min(5),
  description: z.string().min(5),
  estimatedValue: z.number().nonnegative().nullable().optional(),
  lodgementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "lodgementDate must be YYYY-MM-DD"),
  applicantName: z.string().nullable().optional(),
  portalUrl: z.string().url(),
  rawScopeText: z.string().nullable().optional(),
});

const FileSchema = z.array(DaInputSchema).min(1);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipEmbeddings = args.includes(SKIP_EMBEDDINGS_FLAG);
  const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== SKIP_EMBEDDINGS_FLAG);
  if (unknownFlags.length > 0) {
    console.error(`unknown option(s): ${unknownFlags.join(", ")}`);
    process.exitCode = 2;
    return;
  }

  const filePath = args.find((arg) => !arg.startsWith("--"));
  if (!filePath) {
    console.error(`usage: tsx scripts/import-das.ts <path-to-json-file> [${SKIP_EMBEDDINGS_FLAG}]`);
    process.exitCode = 2;
    return;
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = FileSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error("[import] validation failed:");
    console.error(JSON.stringify(parsed.error.issues, null, 2));
    process.exitCode = 1;
    return;
  }
  const records = parsed.data;
  log.info({ count: records.length, file: filePath }, "[import] starting");

  // Stage 1 — upsert development_applications rows.
  for (const r of records) {
    await db.developmentApplication.upsert({
      where: { daId_council: { daId: r.daId, council: r.council } },
      create: {
        daId: r.daId,
        council: r.council,
        address: r.address,
        description: r.description,
        estimatedValue: r.estimatedValue ?? null,
        lodgementDate: new Date(r.lodgementDate),
        applicantName: r.applicantName ?? null,
        portalUrl: r.portalUrl,
        rawScopeText: r.rawScopeText ?? null,
        sourceApi: "manual",
        ruleFilteredOut: false,
        lgaId: r.council, // council slug == lgas.id by convention
      },
      update: {
        address: r.address,
        description: r.description,
        estimatedValue: r.estimatedValue ?? null,
        lodgementDate: new Date(r.lodgementDate),
        applicantName: r.applicantName ?? null,
        portalUrl: r.portalUrl,
        rawScopeText: r.rawScopeText ?? null,
        sourceApi: "manual",
      },
    });
  }
  log.info({ count: records.length }, "[import] DAs upserted");

  // Stage 2 — embed every record. This pre-warms the cache so the Sunday
  // digest cron doesn't spend its per-user budget on first-touch embedding.
  // userId=null → no cost ledger row (system-level reference data).
  if (skipEmbeddings) {
    log.warn(
      { count: records.length },
      "[import] embeddings skipped; digests may fail or rank poorly until embeddings are backfilled",
    );
  } else {
    try {
      await writeEmbeddings(records);
    } catch (err) {
      if (isOpenAiQuotaError(err)) {
        console.error(
          [
            "[import] OpenAI quota exhausted while writing DA embeddings.",
            "The DA rows were already upserted; rerunning this importer is idempotent.",
            `Fix OpenAI billing/quota and rerun, or rerun with ${SKIP_EMBEDDINGS_FLAG} to import rows without vectors.`,
          ].join(" "),
        );
      }
      throw err;
    }
  }
  if (!skipEmbeddings) log.info({ count: records.length }, "[import] embeddings written");

  // Stage 3 — write an ingestion_log entry per council so drift detection
  // doesn't false-alarm on a council that's only fed by manual imports.
  const byCouncil = new Map<string, number>();
  for (const r of records) byCouncil.set(r.council, (byCouncil.get(r.council) ?? 0) + 1);
  for (const [council, count] of byCouncil) {
    await db.ingestionLog.create({
      data: { council, sourceApi: "manual", daCount: count, success: true },
    });
  }
  log.info({ councils: byCouncil.size }, "[import] ingestion_log written");

  log.info({ skippedEmbeddings: skipEmbeddings }, "[import] done");
}

main()
  .catch((err: unknown) => {
    console.error("[import] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });

async function writeEmbeddings(records: z.infer<typeof DaInputSchema>[]): Promise<void> {
  const texts = records.map((r) =>
    `${r.address}. ${r.description}. ${r.rawScopeText ?? ""}`.trim(),
  );
  const vectors = await embedBatch(texts, { userId: null });

  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const vec = vectors[i];
    if (!vec) continue;
    // Look up the just-upserted DA's PK to key da_embeddings on (daId, council)
    const da = await db.developmentApplication.findUniqueOrThrow({
      where: { daId_council: { daId: r.daId, council: r.council } },
      select: { id: true },
    });
    const pgVec = `[${vec.join(",")}]`;
    await db.$executeRaw`
      INSERT INTO da_embeddings (da_id, embedding, embedded_at)
      VALUES (${da.id}, ${pgVec}::vector, now())
      ON CONFLICT (da_id) DO UPDATE SET embedding = EXCLUDED.embedding, embedded_at = now()
    `;
  }
}

function isOpenAiQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { code?: unknown; type?: unknown; status?: unknown };
  return (
    candidate.status === 429 &&
    (candidate.code === "insufficient_quota" || candidate.type === "insufficient_quota")
  );
}
