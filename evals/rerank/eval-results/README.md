# Rerank eval results

Dated precision/recall/F1 runs of each vertical's rerank prompt over its gold
set (`../<vertical>-<jurisdiction>.jsonl`), produced by:

```
pnpm eval:rerank                              # every vertical that has a dataset file
pnpm eval:rerank --vertical roofing           # single target (jurisdiction defaults to nsw)
pnpm eval:rerank --vertical demolition --jurisdiction nsw
```

Results land here as `<vertical>-<jurisdiction>-<date>.json` (e.g.
`roofing-nsw-2026-07-03.json`). Each is committed so we have a per-release record
of the launch gate — **precision ≥ 0.7 at recall ≥ 0.6** on the labelled set
(wedge doc §5.2/§5.4, docs/24 G5) — at the digest-inclusion threshold (score ≥ 3).
The gate is inherited by every future (trade, region) launch (issue #31), not
re-invented per trade.

The command needs `ANTHROPIC_API_KEY`; without it (CI / quality gates) it skips
gracefully and writes nothing. Set `EVAL_INCLUSION_THRESHOLD` to sweep the
threshold, or `--model sonnet` to run the fallback model.

Grow a gold set from the DB with `pnpm label-das --vertical <v> --jurisdiction <j>`
(interactive labelling) then `pnpm export-eval-set --vertical <v> --jurisdiction <j>`
(append `DaGroundTruth` → `<vertical>-<jurisdiction>.jsonl`). Both default to
roofing/nsw.
