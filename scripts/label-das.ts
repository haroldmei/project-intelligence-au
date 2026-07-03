// Interactive DA labelling CLI (issue #19) — grows the rerank gold set toward
// the 500-pair launch gate (docs/24 G5, wedge §5.2/§5.4).
//
// Usage:
//   pnpm label-das                        # label roofing/nsw DAs interactively
//   pnpm label-das --labeller me          # attribute labels to a specific person
//   pnpm label-das --limit 40             # per-stratum cap on how many to present
//   pnpm label-das --vertical demolition  # label for another trade (default roofing)
//   pnpm label-das --jurisdiction sa      # label for another region (default nsw)
//   pnpm label-das --import-thumbs        # import DaFeedback thumbs as candidate labels
//
// Writes DaGroundTruth rows (labeller + timestamp + source + vertical +
// jurisdiction). Runs against the DB in DATABASE_URL — point it at the docker
// test DB or staging, never prod unless you mean it.
import readline from "node:readline";
import { db } from "@/lib/db";
import {
  selectUnlabelledStratified,
  recordLabel,
  importThumbsAsCandidates,
  type UnlabelledDa,
} from "@/modules/evals/labelling";
import { DEFAULT_VERTICAL, DEFAULT_JURISDICTION } from "@/modules/evals/targets";

interface Args {
  labeller: string;
  limit: number;
  importThumbs: boolean;
  vertical: string;
  jurisdiction: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    labeller: process.env.USER ?? "founder",
    limit: 25,
    importThumbs: false,
    vertical: DEFAULT_VERTICAL,
    jurisdiction: DEFAULT_JURISDICTION,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--labeller") args.labeller = argv[++i] ?? args.labeller;
    else if (a === "--limit") args.limit = Number(argv[++i]) || args.limit;
    else if (a === "--vertical") args.vertical = argv[++i] ?? args.vertical;
    else if (a === "--jurisdiction") args.jurisdiction = argv[++i] ?? args.jurisdiction;
    else if (a === "--import-thumbs") args.importThumbs = true;
  }
  return args;
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

function present(da: UnlabelledDa, idx: number, total: number): void {
  const value = da.estimatedValue != null ? `AUD ${da.estimatedValue.toLocaleString()}` : "unknown value";
  const stratum = da.ruleFilteredOut ? "rule-MISS" : "rule-hit";
  console.log(`\n──────────────────────────────────────────────────────────────`);
  console.log(`[${idx + 1}/${total}] ${da.council}  ·  ${value}  ·  ${stratum}`);
  console.log(`DA ${da.daId}  ·  ${da.address}`);
  console.log(`\n${da.description}`);
  if (da.rawScopeText && da.rawScopeText.trim() && da.rawScopeText !== da.description) {
    console.log(`\nScope: ${da.rawScopeText}`);
  }
}

async function labelInteractive(args: Args): Promise<void> {
  const { hits, misses } = await selectUnlabelledStratified(db, {
    labelledBy: args.labeller,
    limitPerStratum: args.limit,
    vertical: args.vertical,
    jurisdiction: args.jurisdiction,
  });
  // Interleave hits and misses so the labeller sees a stratified mix.
  const queue: UnlabelledDa[] = [];
  const max = Math.max(hits.length, misses.length);
  for (let i = 0; i < max; i++) {
    if (hits[i]) queue.push(hits[i]);
    if (misses[i]) queue.push(misses[i]);
  }

  const scope = `${args.vertical}/${args.jurisdiction}`;
  if (queue.length === 0) {
    console.log(`Nothing left to label for "${args.labeller}" in ${scope} — every ${scope} DA already has a label from them.`);
    return;
  }

  console.log(
    `Labelling ${scope} as "${args.labeller}". ${hits.length} rule-hits + ${misses.length} rule-misses queued.`,
  );
  console.log(`Keys:  r = relevant   i = irrelevant   s = skip   q = quit & save\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let labelled = 0;
  try {
    for (let i = 0; i < queue.length; i++) {
      const da = queue[i];
      present(da, i, queue.length);
      let answer = "";
      while (!["r", "i", "s", "q"].includes(answer)) {
        answer = (await ask(rl, "\nrelevant? [r/i/s/q] ")).trim().toLowerCase();
      }
      if (answer === "q") break;
      if (answer === "s") continue;
      await recordLabel(db, {
        daId: da.id,
        council: da.council,
        isRelevant: answer === "r",
        labelledBy: args.labeller,
        source: "manual",
        vertical: args.vertical,
        jurisdiction: args.jurisdiction,
      });
      labelled++;
    }
  } finally {
    rl.close();
  }
  console.log(`\nSaved ${labelled} label(s) as "${args.labeller}".`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.importThumbs) {
    const res = await importThumbsAsCandidates(db, {
      vertical: args.vertical,
      jurisdiction: args.jurisdiction,
    });
    console.log(
      `Imported ${res.imported} thumb(s) as candidate labels (source=thumb), skipped ${res.skipped} already-manual.`,
    );
    console.log(`Review them with: pnpm label-das  (they surface once a manual pass overrides).`);
    return;
  }

  await labelInteractive(args);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
