// Export DaGroundTruth → evals/rerank/<vertical>-<jurisdiction>.jsonl (issue #19,
// parameterised by (vertical, jurisdiction) in issue #31).
//
// Reads the manual (reviewed) ground-truth labels for one (vertical,
// jurisdiction), maps each to a promptfoo case stamped with that vertical's
// saved query (from the pack registry), and appends to that target's dataset —
// deduping against the existing hand-written cases and any prior export so
// re-running is idempotent.
//
// Usage:
//   pnpm export-eval-set                              # roofing/nsw (defaults)
//   pnpm export-eval-set --vertical demolition        # demolition/nsw
//   pnpm export-eval-set --vertical roofing --jurisdiction nsw
//   pnpm export-eval-set --include-thumbs             # also export unreviewed thumb candidates
//   pnpm export-eval-set --dry-run                    # print what would be added, write nothing
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
import {
  DEFAULT_VERTICAL,
  DEFAULT_JURISDICTION,
  datasetFilename,
} from "@/modules/evals/targets";
import { getRegisteredPack } from "@/verticals";

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const includeThumbs = argv.includes("--include-thumbs");
  const vertical = flag(argv, "--vertical") ?? DEFAULT_VERTICAL;
  const jurisdiction = flag(argv, "--jurisdiction") ?? DEFAULT_JURISDICTION;

  // The saved-query context each case runs under is the pack's own default —
  // so exported cases sit in the same query context the vertical launches with.
  const pack = getRegisteredPack(vertical);
  if (!pack) {
    console.error(`Unknown vertical "${vertical}" — no pack registered. Registered packs live in src/verticals/registry.ts.`);
    process.exitCode = 1;
    return;
  }

  const datasetPath = path.join(process.cwd(), "evals", "rerank", datasetFilename({ vertical, jurisdiction }));

  const gt = await loadGroundTruthForExport(db, { includeThumbs, vertical, jurisdiction });
  if (gt.length === 0) {
    console.log(
      `No ${vertical}/${jurisdiction} ground-truth labels to export — run \`pnpm label-das --vertical ${vertical} --jurisdiction ${jurisdiction}\` first.`,
    );
    return;
  }

  const existing = existsSync(datasetPath) ? parseJsonl(readFileSync(datasetPath, "utf-8")) : [];
  const incoming = gt.map((row) => groundTruthToEvalCase(row, { savedQuery: pack.defaultSavedQuery }));
  const { merged, added, skipped } = dedupeCases(existing, incoming);

  console.log(
    `${vertical}/${jurisdiction}  ·  ground-truth rows: ${gt.length}  ·  existing cases: ${existing.length}  ·  new: ${added}  ·  deduped: ${skipped}`,
  );

  if (dryRun) {
    console.log(`--dry-run — ${datasetFilename({ vertical, jurisdiction })} not written.`);
    return;
  }
  if (added === 0) {
    console.log(`Nothing new to add; ${datasetFilename({ vertical, jurisdiction })} unchanged.`);
    return;
  }

  writeFileSync(datasetPath, toJsonl(merged));
  console.log(`Wrote ${merged.length} cases to ${path.relative(process.cwd(), datasetPath)} (+${added}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
