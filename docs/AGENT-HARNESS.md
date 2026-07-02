# ProjectIntelligence autonomous agent harness

Ported from SkillForge (`~/jobhunt/skillforge`). A GitHub-label state machine, driven by
**user systemd timers**, that scouts the product for work, builds accepted issues in
isolated git worktrees, reviews the resulting PRs with an independent model, fixes review
findings with a different model, and auto-merges gate-green integrations into `develop`.
Every stage is a one-shot bash script that shells out to `claude -p`; you stay in control
at one point: accepting a scout proposal (relabel `proposed` → `agent`) or filing your own
`agent` issue from the GitHub app.

```
pi-agent-scout (2×/day) ──files `proposed` issues──▶ YOU accept (relabel `proposed`→`agent`)
pi-agent-pipeline (every minute, one issue end-to-end per run):
  agent-inbox      ── builds in an isolated worktree off origin/develop, runs gates,
                      opens PR `review-needed`
  agent-pr-reviewer (model R = opus)  ── approve→`review-approved` / `changes-requested`
  agent-pr-fixer    (model F = sonnet ≠ R) ── fix + re-gate → `review-needed` … until
                      approved or PR_MAX_ROUNDS → `review-stuck`
  agent-pr-merger   (model M = opus)  ── integrates ALL `review-approved` PRs, re-gates the
                      union, fast-forwards `develop` on green → `merged` / `merge-stuck`
  pipeline          ── closes the issue once its PR carries `merged`
```

## What runs where

| Piece | Script | Driven by | Picks up | Produces |
|---|---|---|---|---|
| Scout | `scripts/agent-scout.sh` | `pi-agent-scout.timer` (04:40 & 16:40) | the codebase vs. `docs/` intent | `proposed` issues (read-only; never pushes) |
| Pipeline | `scripts/agent-pipeline.sh` | `pi-agent-pipeline.timer` (every minute) | one `agent` issue / the in-flight PR | drives the four stages below sequentially |
| Inbox | `scripts/agent-inbox.sh` | the pipeline | one `agent` issue | branch `agent/issue-N` + PR `review-needed`, issue → `done` |
| Reviewer | `scripts/agent-pr-reviewer.sh` | the pipeline | one `review-needed` PR | `review-approved` **or** `changes-requested` |
| Fixer | `scripts/agent-pr-fixer.sh` | the pipeline | one `changes-requested` PR | re-gated push → `review-needed`, or `review-stuck` |
| Merger | `scripts/agent-pr-merger.sh` | the pipeline | ALL `review-approved` PRs | fast-forwarded `develop` + `merged`, or `merge-stuck` |
| Triage | `scripts/agent-triage-failure.sh` | inbox, on red gates | the gate log | transient→retry · self→`needs-human` · infra/unrelated→auto-filed blocker + `blocked` |

Setup (idempotent): `bash scripts/agent-pr-loop-setup.sh` (labels + pipeline timer) and
`bash scripts/agent-scout-setup.sh` (labels + scout timer).
Timers are `pi-`-prefixed (`skillforge-*` = SkillForge, unprefixed `agent-*` = ModelForge).
Status: `systemctl --user list-timers 'pi-agent-*'`.
Logs: `journalctl --user -u pi-agent-pipeline.service -f`, plus `/tmp/pi-agent-*/`.

## The ProjectIntelligence adaptation

The orchestration is stack-agnostic (git + `gh` + `jq` + `claude`). Only the **gate layer**
and the worktree **provisioning** are repo-specific:

- **Base branch is `develop`** (`AGENT_BASE`/`PR_BASE` in the units). `main` is the
  production branch; promote `develop` → `main` yourself. Vercel deploys on push — the
  harness never deploys anything itself.
- **Gates**: `scripts/quality-gates.sh --only typecheck,lint,unit`
  (`tsc --noEmit` · `eslint . --max-warnings=0` · vitest fe + backend suites).
- **Backend test DB**: the backend vitest suite TRUNCATEs its database between tests and
  falls back to `DATABASE_URL` when `TEST_DATABASE_URL` is unset. The unit gate therefore
  *never* runs it without an explicit test DB: `scripts/ensure-test-db.sh` boots/reuses a
  dedicated `pi-test-pg` docker container (pgvector/pgvector:pg16, host port 55432), pushes
  the checkout's Prisma schema, and exports `TEST_DATABASE_URL`. No docker → the backend
  suite is skipped, never pointed at a real DB.
- **Worktree provisioning**: a fresh worktree gets `pnpm install --frozen-lockfile` +
  `pnpm exec prisma generate` (pnpm 10 blocks dependency build scripts, so the client
  generation must be explicit). The scout symlinks the host `node_modules` instead
  (read-only scan). Spurious `pnpm-lock.yaml` churn from provisioning is discarded;
  a lockfile change made by the agent itself (adding a dep) stays in the PR.
- **e2e is not in the harness gates yet.** `e2e/` needs a running app + seeded DB
  (`STUB_DB=1` covers part of it); wire it into `PR_GATES_CMD` once it runs headlessly
  and green from a fresh worktree.

## Labels (the state machine)

- Inbox: `agent` → `wip` → `done` | `needs-human`; triage adds `blocked` (+ auto-filed
  blocker issues labelled `agent`+`harness` or `agent`+`flaky`). A `blocked` issue
  re-queues itself when its blocker closes.
- PR loop: `review-needed` → `review-wip` → `review-approved` | `changes-requested` →
  `fix-wip` → … → `merge-wip` → `merged` | `review-stuck` | `merge-stuck`.
  `*-stuck` PRs are re-armed (bounded) when `develop` advances past them.
- Scout: `proposed` / `proposed-speculative` + engine (`bug`, `ux-customer`, `ux-business`,
  `req`, `journey`, `docs`) + severity (`p0`–`p2`), `single-pass`, `stale`.

## Safety properties (inherited from the SkillForge harness)

1. **Isolation** — every build/review/fix/merge happens in a dedicated worktree under
   `/tmp/pi-agent-*`; your working copy and current branch are never touched.
2. **Gates gate everything** — a red build is never pushed; a red fix is never pushed; a
   red integration is never merged.
3. **Fast-forward only** — the merger never force-pushes `develop`; if it moved, the PRs
   park at `merge-stuck` for a human.
4. **Different models** — reviewer (opus) and fixer (sonnet) must differ (enforced), so no
   model approves its own work.
5. **Self-healing, bounded** — failure triage auto-files deduped blocker issues with
   per-fingerprint attempt caps and a global open-blockers cap; transient LLM limits are
   retried, never escalated.
6. **Idle ticks are cheap** — no eligible issue + no in-flight PR → the pipeline exits in
   seconds; the scout files nothing when it finds nothing.
