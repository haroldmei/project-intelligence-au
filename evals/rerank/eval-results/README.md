# Rerank eval results

Dated precision/recall/F1 runs of the roofing rerank prompt over
`../dataset.jsonl`, produced by:

```
pnpm eval:rerank
```

Each `<date>.json` is committed so we have a per-release record of the launch
gate — **precision ≥ 0.7 at recall ≥ 0.6** on the labelled set (wedge doc
§5.2/§5.4, docs/24 G5) — at the digest-inclusion threshold (score ≥ 3).

The command needs `ANTHROPIC_API_KEY`; without it (CI / quality gates) it skips
gracefully and writes nothing. Set `EVAL_INCLUSION_THRESHOLD` to sweep the
threshold, or `--model sonnet` to run the fallback model.

Grow the gold set from the DB with `pnpm label-das` (interactive labelling) then
`pnpm export-eval-set` (append `DaGroundTruth` → `dataset.jsonl`).
