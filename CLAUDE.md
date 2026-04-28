# build-product — project notes for Claude

## Default product builder

**When the user asks to "build a product" / "build me X" / "build a
SaaS" / similar, invoke `build-product-v2`.**

`build-product-v2` is the canonical orchestrator: state-machine,
critic gates, scale-tier branching, dogfood loop, human checkpoints,
and per-phase subagent contexts. See
`.claude/skills/build-product-v2/SKILL.md`.

## Pipeline architecture (one-screen overview)

```
ceo → differentiation → [HUMAN] → tech-stack-selector → product-spec
  → analyst → designer → ux-designer → [HUMAN]
  → auth-engineer → (email-templates if needed) → (ai-features if ai_heavy)
  → [backend + frontend + db-migrator]  (parallel)
  → api-docs → e2e-tester
  → quality-gates (typecheck → lint → unit → mutation → integration → contract → e2e → a11y → lighthouse → visual)
  → adversarial-tester → security-auditor → dogfood
  → (launch+ only: perf-tester → reviewer)
  → pricing → positioning → [HUMAN] → landing-page → legal-compliance
  → (launch+ only: background-jobs → env-manager → cicd → deployer → observability → rollback → production-readiness)
  → preview-ship → [HUMAN] → analytics
  → signal-iterate (recurring)
```

**Stack contract:** `differentiation` emits stack constraints
(realtime, ai_heavy, regulated, multi_tenant_b2b, eu_global_billing,
mobile_first, data_heavy). `tech-stack-selector` runs after the first
human checkpoint and writes `docs/00-tech-stack.md` — the binding
contract every downstream skill reads. CI/CD defaults to **Buildkite**
(cost-effective; org has `$BK_API_TOKEN`); GitHub Actions / GitLab CI
are alternatives, opted into via the contract.

Each `→` between two strategic artifacts has a critic gate (different
model from the producer). The four boxes marked HUMAN in
`build-product-v2` SKILL.md are non-skippable user confirmations.

## Scale tiers

Pick a tier early; later phases gate on it.

| Tier | When | Skips |
|---|---|---|
| `toy` | Throwaway prototype | jobs, env, cicd, infra, observability, PRR, deploy |
| `preview` | Public demo, ≤ 100 users | jobs, env, cicd, infra, observability, PRR (deploys to Vercel/Fly preview) |
| `launch` | Paying customers, single region | infra, observability, PRR |
| `scale` | Multi-region / enterprise | nothing — runs the full pipeline |

Default is `preview`. Don't run Terraform for an MVP.

## Project scripts

Live in `scripts/`. The orchestrator and skills assume they exist.

- `state-init.sh "<idea>"` — create / upgrade `state/state.json`
- `state-set.sh '<jq path>' '<json value>'` — atomic field write
- `state-decide.sh <phase> "<decision>" "<reason>"` — append ADR
- `quality-gates.sh [--only x,y] [--skip z] [--keep-going]` — layered hard gates
- `route-failure.sh --gate <g> --area <path>` — map failure → owner skill

All are bash + jq, no Node deps.

## Skills inventory

See `docs/00-pipeline-research-and-redesign.md` for the full list,
the design rationale, and the open backlog.

New (round 1 + round 2): `differentiation`, `pricing`, `positioning`,
`adversarial-tester`, `dogfood`, `signal-iterate`, `build-product-v2`.

## Notes for collaboration

- The user prefers terse responses; don't summarize what's already in
  the diff.
- Don't add backwards-compat shims when retiring legacy code; just
  delete it.
- For UI changes, use the `dogfood` skill or the `browse` skill —
  don't claim a UI works without driving it in a real browser.
