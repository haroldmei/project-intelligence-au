# build-product — project notes for Gemini CLI

This file is auto-loaded by Gemini CLI as project memory (the
equivalent of Claude Code's `CLAUDE.md`).

## Default product builder

**When the user asks to "build a product" / "build me X" / "build a
SaaS" / similar, run `/build-product-v2 "<idea>"`.**

That command invokes the bash orchestrator at
`bin/gemini-build-product-v2`, which drives the v2 state machine
through the per-phase agents in `.gemini/agents/`.

**Why the orchestrator is bash, not an agent:**
Gemini CLI explicitly forbids subagents from spawning subagents. The
orchestrator pattern from `.claude/skills/build-product-v2` cannot be
ported as a Gemini agent. So orchestration moves out into a shell
script; each phase still runs in its own isolated agent context (the
part Gemini does support).

## Pipeline architecture

```
ceo → @critic ceo → differentiation → @critic diff → [HUMAN]
  → tech-stack-selector → @critic stack
  → product-spec → @critic spec → analyst → designer → @critic design
  → ux-designer → @critic ux → [HUMAN]
  → auth-engineer → (email-templates if needed) → (ai-features if ai_heavy)
  → backend-developer → frontend-developer → db-migrator (sequential)
  → api-docs → e2e-tester
  → quality-gates.sh (typecheck → lint → unit → mutation → integration → contract → e2e → a11y → lighthouse → visual)
  → adversarial-tester → security-auditor → dogfood (verdict routes)
  → (launch+ only: perf-tester → reviewer)
  → pricing → positioning → [HUMAN] → landing-page → legal-compliance
  → (launch+ only: background-jobs → env-manager → cicd → deployer →
                   observability → rollback → production-readiness if scale)
  → preview-ship → [HUMAN] → analytics
  → signal-iterate (recurring via OS cron — Gemini lacks scheduling)
```

The four mandatory human checkpoints are non-skippable.

## Stack contract

`differentiation` emits stack constraints. `tech-stack-selector` writes
`docs/00-tech-stack.md` — the binding contract every downstream agent
reads. CI/CD defaults to **Buildkite** (cost-effective; org has
`$BK_API_TOKEN`); GitHub Actions / GitLab CI are alternatives, opted
into via the contract.

## Scale tiers

| Tier | When | Skips |
|---|---|---|
| `toy` | Throwaway prototype | jobs, env, cicd, infra, observability, PRR, deploy |
| `preview` | Public demo, ≤ 100 users | jobs, env, cicd, infra, observability, PRR (deploys to Vercel/Fly preview) |
| `launch` | Paying customers, single region | infra extras, observability extras, PRR |
| `scale` | Multi-region / enterprise | nothing — runs the full pipeline |

Default is `preview`. Picked at the first human checkpoint.

## Project scripts

Live in `scripts/`. The orchestrator and agents assume they exist.

- `state-init.sh "<idea>"` — create / upgrade `state/state.json`
- `state-set.sh '<jq path>' '<json value>'` — atomic field write
- `state-decide.sh <phase> "<decision>" "<reason>"` — append ADR
- `quality-gates.sh [--only x,y] [--skip z] [--keep-going]` — layered hard gates
- `route-failure.sh --gate <g> --area <path>` — map failure → owner agent

Bash + jq + yq, no Node deps.

## Agents inventory

34 agents in `.gemini/agents/`, ported from `.claude/skills/`.

**Strategy:** ceo, differentiation, tech-stack-selector, product-spec,
analyst, designer, ux-designer, pricing, positioning

**Implementation:** auth-engineer, ai-features, backend-developer,
frontend-developer, db-migrator, email-templates, background-jobs,
api-docs, analytics, observability, landing-page, legal-compliance

**Testing:** e2e-tester, perf-tester, adversarial-tester,
security-auditor, dogfood

**Ops:** cicd, deployer, env-manager, rollback, production-readiness

**Iteration:** iterate, signal-iterate (called externally via
`bin/gemini-iterate` / `bin/gemini-signal-iterate`)

**Critic:** a single `@critic <phase> <doc>` agent dispatches by phase
name (ceo, diff, stack, spec, design, ux, pricing, positioning).

## Notes for collaboration

- The user prefers terse responses; don't summarize what's already in
  the diff.
- Don't add backwards-compat shims when retiring legacy code; just
  delete it.
- For UI changes, use a browse extension (or screenshot via Playwright)
  — don't claim a UI works without driving it in a real browser.
- This project is dual-targeted: the Claude port lives in
  `.claude/skills/`, the Gemini port lives in `.gemini/agents/` +
  `.gemini/commands/` + `bin/`. See `PORTING-NOTES.md` for the
  feature gap table and what doesn't translate cleanly.
- Gemini-specific limits:
  - **No nested subagents**: orchestration is in `bin/` shell scripts.
  - **No scheduled agents**: use OS `cron` for `signal-iterate`.
  - **No background agents**: long jobs via `nohup` or `tmux`.
  - **No programmatic skill invocation**: agents cannot call other
    agents — they exit, and the bash orchestrator dispatches the next.
