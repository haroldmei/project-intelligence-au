# Autonomous Product-Builder Pipeline — Research & Redesign Notes

> Source: synthesis of the project's `.claude/skills/` files plus established public material on multi-agent systems
> (Anthropic's multi-agent research-system writeup, MetaGPT, ChatDev, AutoGen, CrewAI, LangGraph, BMAD,
> Devin, Cursor Background Agents, Lovable, Bolt.new, v0, Replit Agent, YC content, Google SRE, OWASP).
> Treat references as pointers, not live citations. Date: 2026-04-27.

---

## 1. Skills inventory in `/home/hmei/jobhunt/build-product/.claude/skills/`

28 project skills, grouped by pipeline role:

### Strategy & spec (4)
- `ceo` — market analysis (TAM/SAM/SOM, competitors, GTM wedge) → `docs/01-market-analysis.md`
- `product-spec` — personas, story map, Gherkin AC, MVP scope, KPIs → `docs/01b-product-spec.md`
- `analyst` — IEEE-830 SRS (FR/NFR IDs, use cases) → `docs/02-system-requirements.md`
- `designer` — system architecture, components, APIs, data → `docs/03-system-design.md`

### Design (2)
- `ux-designer` — design system, wireframes, a11y, Tailwind theme → `docs/03b-ux-design.md`
- `ui-design` — production UI for the Anti-Plagiarism product (legacy/per-product)

### Implementation (6)
- `backend-developer` — API, auth, business logic, integrations, jobs
- `frontend-developer` — component library, pages, state, a11y
- `db-migrator` — versioned migrations + seed data
- `background-jobs` — BullMQ/Redis queues, cron
- `email-templates` — transactional templates + sender service
- `developer` — generic implementer (overlaps backend/frontend)

### Quality & QA (4)
- `reviewer` — full-codebase review → `docs/05-code-review.md` + fix loop
- `security-auditor` — OWASP Top 10, npm audit, secrets, headers
- `e2e-tester` — Playwright suites
- `perf-tester` — k6 load tests, bundle audit, N+1 hunt

### Compliance & ops (6)
- `legal-compliance` — privacy/ToS/cookie banner, GDPR/APPs, retention
- `env-manager` — `.env.example`, typed config, docker-compose, tfvars
- `cicd` — Buildkite pipeline + Dockerfile
- `deployer` — Terraform IaC (GCP/AWS modules)
- `observability` — pino logging, health checks, alerts
- `rollback` — pre-deploy / verify / rollback scripts + runbook

### Growth & launch (4)
- `landing-page` — SEO-optimized marketing page
- `analytics` — PostHog/GA4/Mixpanel + funnels + admin dashboard
- `production-readiness` — PRR checklist, SLOs, backup/DR, GO/NO-GO
- `api-docs` — OpenAPI 3.1 + reference

### Orchestration & loop (2)
- `build-product` — sequential 26-phase orchestrator
- `iterate` — gap analysis + market re-scan + new-feature loop

Plus three slash commands (`skillforge-dev`, `skillforge-frontend`, `skillforge-review`) and two parallel `.gemini/skills/` mirrors.

---

## 2. How this pipeline compares to the industry state of the art

The architecture is a **linear, document-driven, single-context orchestrator-worker pipeline** in the lineage of
MetaGPT (PRD→design→tasks→code), ChatDev (role-based dialogue), and BMAD method.
The strength is determinism and traceability (every phase produces a versioned artifact).
The systemic weaknesses, measured against Devin / Cursor Background Agents / Lovable / Bolt / v0 / Replit Agent
and Anthropic's own multi-agent research-system writeup, are well-known:

| Failure mode | Why it happens here | What top systems do |
|---|---|---|
| **Generic SaaS clone output** | `ceo` writes a market report, but nothing forces a *narrow wedge* or *non-consensus thesis*; `product-spec` then dutifully picks "must-haves" that match every competitor. | YC office-hours-style adversarial questioning ("who specifically, and what do they do today?"), forced "10x not 10%" differentiation, kill-switch criteria. |
| **Context drift across 26 phases** | All phases run in one long orchestrator, so by Phase 20 the model has lost the Phase 1 strategic intent and is just executing checklists. | Anthropic's research system uses *fresh subagent contexts* per task with a small, structured handoff (the "blackboard"). Devin uses an explicit memory store. |
| **No branching / no taste decisions** | The pipeline never says "we have two viable architectures, pick one with a tradeoff matrix." It picks the first plausible one. | LangGraph / CrewAI conditional edges + planner-critic loops. AutoGen `GroupChat` with a critic agent. |
| **Verification = "tests pass"** | Tests are model-written, so they encode the model's misunderstanding. Passing tests ≠ correct product. | Property-based tests (fast-check, hypothesis), golden-dataset behavioral tests, mutation testing (Stryker), LLM-as-judge with adversarial prompts, and **dogfooding** (open in headless browser, do the user flow, screenshot diff). |
| **No real user signal** | The product is shipped without anyone using it. KPIs are defined but never measured against real traffic. | Lovable / Bolt let you preview-and-edit live; v0 shows you the artifact each step. The missing equivalent here is a *staging URL + browser dogfood loop* before "production readiness." |
| **No competitive UI benchmarking** | `ux-designer` makes a design system from scratch instead of *reverse-engineering the dominant competitor* and beating it on one axis. | Plan-design-review style scoring (0–10 per dimension), automated Lighthouse + axe-core gates, before/after screenshots vs the top 3 competitor screens. |
| **Over-engineering MVPs** | Phase 9 (BullMQ/Redis), Phase 19 (full Terraform), Phase 20 (alerting), Phase 24 (PRR) all run for a v0.1 product with zero users. | YC-shaped "do things that don't scale": skip queues until you have a queue problem; skip Terraform until you have a multi-env problem. |
| **Hallucinated requirements** | `analyst` invents NFRs ("p95 < 500ms", "99.9% availability") with no input data. These become "passing" boxes. | Tie every NFR to a *measured baseline or stated user need*. If unmeasured, mark `Aspirational`, not `Requirement`. |
| **No human-in-the-loop at high-leverage points** | The orchestrator explicitly says "Do not ask clarifying questions. Make reasonable decisions." This is correct for autonomy but wrong for the 4 places humans add 80% of the value. | Mandatory checkpoints at: (1) wedge/ICP, (2) primary user-flow demo, (3) pricing, (4) launch GO/NO-GO. |
| **Single-model monoculture** | All phases use the same model with the same priors. | Anthropic's writeup recommends *adversarial diversity* — a separate "challenger" agent (the gstack `/codex` skill is the equivalent). Use it as a gate, not a one-off. |

### Frameworks worth mining

- **Anthropic — "How we built our multi-agent research system"** — orchestrator + parallel sub-agents + memory + careful token budgets.
- **MetaGPT** — SOP-based role assembly.
- **ChatDev** — role-dialogue + waterfall.
- **CAMEL** — role-playing agents.
- **AutoGen** — group-chat + reflection.
- **LangGraph** — state-machine with conditional edges + retries.
- **BMAD** — PM / SM / architect / dev cycle.
- **Spec-Driven Development** (Kiro / Spec Kit).

### Quality benchmarks worth adopting

- **SWE-Bench** for code-eval baselines.
- **WebArena** for end-to-end UX agents.
- **OWASP ASVS** as the security target instead of the "OWASP Top 10."
- **Google SRE PRR template** (already loosely mirrored in `production-readiness`).

---

## 3. Concrete redesign recommendations — 15 changes ordered by leverage

### A. Strategy / spec phase — kill the "generic SaaS" output

**1. Replace `ceo` with a YC-office-hours-style adversarial role.**
Force six questions before any market report: *who specifically, what do they do today, what would they pay for,
what's the narrowest wedge, what's the single observation no competitor has, what would 10× look like.*
Refuse to produce `01-market-analysis.md` until those are answered (read from a structured input file, not free-form `$ARGUMENTS`).
Today's `ceo` skill is a research report; it should be a *thesis*. Pair it with `plan-ceo-review` as a mandatory critic gate.

**2. Add a `differentiation` skill between `ceo` and `product-spec`.**
It picks *one axis to beat the market on* (price, speed, depth, niche, integration breadth, design taste) and refuses to proceed if the answer is
"we'll be better at everything." Write `docs/01c-wedge.md`. Every later skill must reference this file and explain how its choices serve the wedge.

**3. Hard cap MVP scope.**
`product-spec` currently invites scope creep through MoSCoW. Replace with **"one critical user flow that delivers the wedge"** + max 3 supporting flows.
Anything else gets tagged `[V2]` and is *not* implemented in the first run. This alone removes ~40% of the work the pipeline currently does and dramatically improves polish on what ships.

### B. Architecture — break up the monolithic 26-phase context

**4. Convert `build-product` from a single long context into an orchestrator that spawns fresh subagent contexts per phase**,
with structured handoffs. Each subagent reads only the docs it needs (define a per-phase "context manifest" — `ux-designer` doesn't need `09-security-audit.md`).
This is exactly Anthropic's pattern and it cuts hallucination from context bloat dramatically.

**5. Replace the linear waterfall with a state-machine** (LangGraph-style).
Conditional edges:
- if `gap-analysis` finds critical gaps, loop back to `analyst`;
- if `qa` health-score < 7, loop back to `frontend-developer`;
- if security audit finds Critical, loop back to the offending implementer not just "fix locally."

The current `iterate` skill is a band-aid that runs *after* the whole pipeline; you want loops *during* it.

**6. Introduce a persistent blackboard** instead of relying on doc files alone.
A small `state.json` (or Claude memory tool) holding: wedge, ICP, current phase, open issues, critic verdicts, KPI targets, decisions log.
Each subagent reads/writes structured state. Doc files remain the human-readable artifact, blackboard is the machine handoff.

**7. Add an explicit critic / challenger role at every phase boundary.**
Today phases pass each other on faith. Wire `/codex` (or a second-model challenger) as a *gate*: spec → critic → fix or proceed; design → critic → fix or proceed.
Anthropic, MetaGPT, ChatDev all do this; without it the pipeline compounds early errors for 20 more phases.

### C. Implementation — align tests with reality

**8. Test-driven generation, not test-after.**
Have `backend-developer` / `frontend-developer` write the tests *first* from the SRS Gherkin AC, then the implementation.
This is what makes "tests pass" actually mean something.
Add **mutation testing** (Stryker for JS) as a coverage signal — current "all green" is meaningless without it.

**9. Add an adversarial-test agent.**
A separate skill whose only job is to write tests that *try to break* the implementation: edge cases, negative inputs, race conditions, malformed data, abusive flows.
Couples nicely with `security-auditor` which today only does static + npm-audit.

**10. Replace "tests pass" with a layered gate**:

```
typecheck
  → lint
  → unit
  → mutation score ≥ 70%
  → integration
  → contract tests against OpenAPI
  → Playwright happy path
  → axe-core a11y
  → Lighthouse perf budget
  → visual regression
```

Each is a hard gate, not a "fix until green" loop. Today the pipeline collapses all of these into "run tests, fix until pass" which is too coarse.

### D. UX — beat the dominant competitor, don't invent from scratch

**11. Force competitive UI benchmarking in `ux-designer`.**
Before designing anything, screenshot-and-analyze the top 3 competitors' core flows (use the `browse` skill).
Identify what they do well, what's bad, then design *against* that — not in a vacuum.
Add a `plan-design-review`-style 0-10 rubric across hierarchy, taste, motion, density, brand, and refuse to proceed until ≥ 7 across all dimensions.

**12. Add a live dogfood loop after `frontend-developer`.**
Spin a dev server, drive the critical user flow with the `browse` skill, screenshot each step, compare against wireframes, file bugs into the dev plan, fix, repeat.
This is what `qa` / `design-review` do in gstack — wire them in before `production-readiness`, not as an afterthought.

### E. Right-size the ops phases for an MVP

**13. Make Phases 9, 17, 18, 19, 20, 22, 24 conditional.**
A v0.1 with zero users does not need BullMQ + Terraform + Buildkite + PRR.
Add a `scale-tier` decision (toy / preview / launch / scale) early in the run; gate later phases on it.

| Tier | Description | Phases included |
|---|---|---|
| **toy** | Throwaway prototype, single user | 1–8, 11, 12, 21 |
| **preview** | Public demo, low-stakes | toy + 13 (security), 14 (E2E happy path), 23 (analytics), Vercel/Fly deploy |
| **launch** | Paying customers, single region | preview + 9 (jobs), 10 (email), 16 (legal), 17 (env), 18 (CI/CD), 22 (rollback) |
| **scale** | Multi-region, multi-tenant, paying enterprise | launch + 15 (perf), 19 (Terraform), 20 (observability), 24 (PRR) |

Most products should ship at "preview" tier (Vercel / Fly + managed Postgres + Sentry, no Terraform, no PRR).
The current pipeline's bias toward enterprise rigor for every product is one of the biggest reasons agent-built products feel slow and overweight.

**14. Add pricing & positioning skills before launch.**
No skill currently sets pricing, positioning copy, or onboarding flow — the three things that determine whether anyone actually pays.
Add:
- `pricing` — research comparable prices, propose tiers + free-trial mechanics → `docs/16-pricing.md`
- `positioning` — one-line value prop, 3-line elevator, hero-section copy → `docs/17-positioning.md`

These run *before* `landing-page`. Today `landing-page` invents this content from thin air.

### F. Continuous learning loop

**15. Replace `iterate` with a *signal-driven* loop, not a calendar loop.**
Today `iterate` re-scans the market and re-implements gaps. Make it instead read **real signals**:
PostHog funnels, error rates from observability, support inbox if any, top-of-funnel from analytics.
Prioritize the next iteration based on what users actually do, not what the model thinks the market wants.
This is the difference between Lovable iterating on user feedback and the pipeline talking to itself.

---

## 4. Harness-level changes (bonus)

- **Specialize models per phase.** Use Opus for `ceo` / `differentiation` / `designer` / `reviewer` (taste & reasoning),
  Sonnet for `backend-developer` / `frontend-developer` (volume of code), Haiku for `api-docs` / `env-manager` (mechanical work).
  Cuts cost ~3× for similar quality.
- **Prompt cache the doc bundle.** The first 5 doc files are read by every later phase — cache them once and reuse.
  Major latency / cost win.
- **Add a `decisions.md` log.** Every taste-call (architecture style, framework, pricing, color palette) gets a one-line ADR.
  Lets a human reviewer skim 30 decisions in 2 minutes instead of reading 15 docs.
- **Promote `/codex` from on-demand to mandatory critic** at the spec, design, and pre-launch boundaries.

---

## 5. TL;DR — the four highest-leverage changes

1. **Force a sharp wedge** before any building — new `differentiation` skill + adversarial CEO.
2. **Break the monolithic context** — orchestrator + fresh subagents + structured blackboard + critic gates.
3. **Make tests mean something** — TDD generation, mutation testing, adversarial tests, plus a live browser dogfood loop.
4. **Right-size ops to scale-tier** — MVPs ship in hours, not days of Terraform.

Do those four and the pipeline goes from "produces a credible-looking SaaS skeleton" to "produces something with a real chance of finding a market."

---

## 6. Deliverables — status

### Drafted (round 1 — orchestrator + wedge + state)
- [x] `differentiation` skill — `.claude/skills/differentiation/SKILL.md`
- [x] Refactored orchestrator — `.claude/skills/build-product-v2/SKILL.md` (state-machine + critic gates + scale-tier branching + per-phase context manifest + model routing)

### Drafted (round 2 — pricing, positioning, quality, dogfood, signals)
- [x] `pricing` skill — `.claude/skills/pricing/SKILL.md`
- [x] `positioning` skill — `.claude/skills/positioning/SKILL.md`
- [x] `adversarial-tester` skill — `.claude/skills/adversarial-tester/SKILL.md`
- [x] `dogfood` skill — `.claude/skills/dogfood/SKILL.md`
- [x] `signal-iterate` skill (signal-driven replacement for `iterate`) — `.claude/skills/signal-iterate/SKILL.md`
- [x] State blackboard helpers — `scripts/state-init.sh`, `scripts/state-set.sh`, `scripts/state-decide.sh`
- [x] Layered quality-gate runner — `scripts/quality-gates.sh`
- [x] Failure router — `scripts/route-failure.sh`

### Open
- [ ] End-to-end dogfood of `build-product-v2` on a sample idea (validate the state machine actually runs)
- [ ] Wire `update-config` hooks so the orchestrator can call `state-*.sh` automatically without permission prompts
- [ ] Replace original `build-product` and `iterate` aliases (or keep as legacy)
- [ ] Per-stack quality-gate plugins (Python, Go, Rust) — current runner is Node-first
- [ ] CI wrapper that runs `quality-gates.sh` on PR and blocks merge on red
