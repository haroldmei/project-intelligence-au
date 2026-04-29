// Manual DA importer — reads a JSON file of DA records and pushes them
// through the existing ingestion pipeline (development_applications upsert
// + da_embeddings + ingestion_log). Use this while council scrapers are
// still being built (docs/19-deploy-runbook.md, docs/22-pipeline-enable.md).
//
// Usage:
//   pnpm exec tsx --env-file-if-exists=.env.local scripts/import-das.ts data/das/sample-roofing-week.json
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

const log = pino({ name: "import-das", transport: { target: "pino-pretty" } }).child({});

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

type DaInput = z.infer<typeof DaInputSchema>;

const FileSchema = z.array(DaInputSchema).min(1);

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("usage: tsx scripts/import-das.ts <path-to-json-file>");
    process.exit(2);
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = FileSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error("[import] validation failed:");
    console.error(JSON.stringify(parsed.error.issues, null, 2));
    process.exit(1);
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
  log.info({ count: records.length }, "[import] embeddings written");

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

  log.info("[import] done");
  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error("[import] fatal:", err);
  process.exit(1);
});
