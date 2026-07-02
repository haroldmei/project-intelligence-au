// Export DaGroundTruth → evals/rerank/dataset.jsonl (issue #19).
//
// Reads the manual (reviewed) ground-truth labels, maps each to a promptfoo
// case, and appends to the existing dataset — deduping against the 22
// hand-written cases and any prior export so re-running is idempotent.
//
// Usage:
//   pnpm export-eval-set                 # append manual labels to dataset.jsonl
//   pnpm export-eval-set --include-thumbs # also export unreviewed thumb candidates
//   pnpm export-eval-set --dry-run       # print what would be added, write nothing
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { loadGroundTruthForExport } from "@/modules/evals/labelling";
import {
  groundTruthToEvalCase,
  parseJsonl,
  toJsonl,
  dedupeCases,
} from "@/modules/evals/export";

const DATASET_PATH = path.join(process.cwd(), "evals", "rerank", "dataset.jsonl");

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const includeThumbs = argv.includes("--include-thumbs");

  const gt = await loadGroundTruthForExport(db, { includeThumbs });
  if (gt.length === 0) {
    console.log("No ground-truth labels to export — run `pnpm label-das` first.");
    return;
  }

  const existing = existsSync(DATASET_PATH) ? parseJsonl(readFileSync(DATASET_PATH, "utf-8")) : [];
  const incoming = gt.map((row) => groundTruthToEvalCase(row));
  const { merged, added, skipped } = dedupeCases(existing, incoming);

  console.log(
    `Ground-truth rows: ${gt.length}  ·  existing cases: ${existing.length}  ·  new: ${added}  ·  deduped: ${skipped}`,
  );

  if (dryRun) {
    console.log("--dry-run — dataset.jsonl not written.");
    return;
  }
  if (added === 0) {
    console.log("Nothing new to add; dataset.jsonl unchanged.");
    return;
  }

  writeFileSync(DATASET_PATH, toJsonl(merged));
  console.log(`Wrote ${merged.length} cases to evals/rerank/dataset.jsonl (+${added}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
