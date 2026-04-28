# User Manual — `build-product` Skills

**Last updated:** 2026-04-28
**Pipeline version:** v2 (state-machine, contract-driven)
**Stack contract version:** 2026-Q2

This manual covers how to use the skills in `.claude/skills/` to build,
ship, and iterate on a production-grade product. Read the
[Quick Start](#quick-start) first; the four workflow sections after it
are independent and can be jumped to.

---

## Table of contents

1. [Quick Start](#quick-start)
2. [Mental model](#mental-model)
3. [Prerequisites](#prerequisites)
4. **[Workflow A — Build a production-ready product from scratch](#workflow-a--build-a-production-ready-product-from-scratch)**
5. **[Workflow B — Iterate from a new market analysis](#workflow-b--iterate-from-a-new-market-analysis)**
6. **[Workflow C — Iterate from a specific idea or requirement](#workflow-c--iterate-from-a-specific-idea-or-requirement)**
7. **[Workflow D — Explore all the ways of using the skills](#workflow-d--explore-all-the-ways-of-using-the-skills)**
8. [Skill reference](#skill-reference)
9. [File map (what gets written where)](#file-map)
10. [Troubleshooting](#troubleshooting)

---

## Quick Start

Two paths into the system:

```
# Full product build (orchestrated)
/build-product-v2 "<one-sentence product idea>"

# Targeted single-skill invocation
/<skill-name> [args]
```

That is the entire surface. Everything below explains *which path* and
*which skills* fit *which situation*.

---

## Mental model

The pipeline has four invariants. If you understand these, the rest is
mechanical.

### 1. The wedge is law

`differentiation` produces `docs/01c-wedge.md`. It contains the wedge
sentence (≤ 140 chars), the chosen axis, the anti-axis, and the
**stack constraints** (`realtime`, `ai_heavy`, `regulated`,
`multi_tenant_b2b`, `eu_global_billing`, `mobile_first`, `data_heavy`).
Every later phase reads this and refuses out-of-wedge work.

### 2. The tech-stack contract is law

`tech-stack-selector` produces `docs/00-tech-stack.md`. It pins
versions, picks vendors, declares `not_in_stack`. Every implementation
skill reads it as the binding contract — they will not silently
substitute Drizzle for Prisma, or SendGrid for Resend, or anything in
`not_in_stack`.

### 3. Scale tier gates ops phases

| Tier | Use when | Skips |
|---|---|---|
| `toy` | Throwaway, internal demo | jobs, env, cicd, infra, observability, PRR, deploy |
| `preview` | ≤ 100 users, no SLA | jobs, env, cicd, infra, observability, PRR (deploys to Vercel/Fly) |
| `launch` | Paying customers, single region | infra, observability, PRR |
| `scale` | Multi-region / enterprise | nothing — full pipeline |

Default is `preview`. Don't pick `launch` unless you actually plan to
charge real money.

### 4. Four mandatory human checkpoints

The orchestrator stops and asks at:

1. **After `differentiation`** — confirm wedge + ICP + scale tier + stack constraints
2. **After `ux-designer`** — confirm visual / interaction target
3. **After `pricing` + `positioning`** — confirm tiers + headline
4. **At preview-ship** — GO/NO-GO before public exposure

These are non-skippable. If you want a fully autonomous run, this is
the wrong tool — these checkpoints exist because the four decisions
they gate are the ones humans should make.

---

## Prerequisites

Environment variables (set in `~/.bashrc`):

```bash
# CI/CD (Buildkite is the cost-effective default)
export BK_API_TOKEN=...
export BUILDKITE_ORG=haiyuan-mei
export DOCKER_USERNAME=...
export DOCKER_PASSWORD=...

# Cloud (GCP default; AWS alternative)
export PROJECT_ID=...           # GCP project
# OR ensure aws sts get-caller-identity works

# Optional, per scale tier
export VERCEL_TOKEN=...          # if deploy.preview_tier_target=vercel
export FLY_API_TOKEN=...         # if deploy.preview_tier_target=fly
export RESEND_API_KEY=...        # if email.provider=resend
export STRIPE_SECRET_KEY=...     # if payments.provider=stripe
export ANTHROPIC_API_KEY=...     # if ai.provider=anthropic

# Iteration loop signals (signal-iterate)
export POSTHOG_API_KEY=...
export SENTRY_API_TOKEN=...
```

CLI tools needed:

- `git`, `node`, `npm`/`pnpm`, `docker`, `jq`, `yq` (always)
- `gcloud` or `aws` (only at `launch` / `scale`)
- `terraform` (only at `launch` / `scale`)
- `vercel` or `flyctl` (only for `preview` deploy)

---

## Workflow A — Build a production-ready product from scratch

> **Use this when:** You have an idea and want a real, deployable
> product with paying customers in mind. Choose `launch` tier at the
> first human checkpoint.

### A.1 Start the orchestrator

```
/build-product-v2 "AI-powered invoice reconciliation for solo bookkeepers serving Shopify DTC brands"
```

The orchestrator initializes `state/state.json` via
`scripts/state-init.sh` and creates `docs/`. From here it will spawn
fresh sub-agents per phase. You sit back until a checkpoint.

### A.2 Phases 1–2 — Strategy (≈ 10–20 min)

The orchestrator runs:

- **`ceo`** → `docs/01-market-analysis.md` (TAM/SAM/SOM, ≥ 5 competitors, wedge candidates)
- **`ceo_critic`** (different model) — gates on platitude-free, sourced, non-trivial competitor matrix
- **`differentiation`** → `docs/01c-wedge.md` with the six forcing questions, single axis, kill switches, and **stack constraints**
- **`diff_critic`** — gates on single-axis, < 140 char wedge, "could a competitor copy in a weekend?" test

### A.3 Human checkpoint 1 — wedge + tier + constraints

The orchestrator surfaces:

```
Wedge:         <one-sentence wedge>
ICP:           <specific role + industry + size + trigger event>
Scale tier:    [toy | preview | launch | scale]
Constraints:   ai_heavy=true, regulated=false, ...
```

**For a production product, pick `launch`.** Confirm or revise. If you
revise, the orchestrator loops back to `differentiation`.

### A.4 Phase 2.7 — Tech stack contract (NEW)

After confirmation, **`tech-stack-selector`** writes
`docs/00-tech-stack.md`:

- Pinned 2026-Q2 versions (Node 22, Next 15, Postgres 16, Redis 7, …)
- Vendors picked per scale tier and constraints (e.g. `ai_heavy=true` flips on `pgvector` + `ai.cost_tracking: required`)
- `ci.provider: buildkite` by default (cost-effective for this org)
- `not_in_stack` list (declares what is retired — SendGrid, bcrypt-as-default, github-actions for this org, etc.)

The `stack_critic` then checks pins, rationale, and constraint
coverage. If you see a vendor you don't want, **stop here** and either
edit `docs/00-tech-stack.md` directly or rerun `tech-stack-selector`
with a different argument hint.

### A.5 Phases 3–6 — Specs and design (≈ 30–60 min)

- **`product-spec`** → `docs/01b-product-spec.md` (PRD, one critical flow + ≤ 3 supporting, KPIs)
- **`analyst`** → `docs/02-system-requirements.md` (FRs/NFRs, IEEE 830, every FR tagged wedge-critical / wedge-supporting / out-of-wedge)
- **`designer`** → `docs/03-system-design.md` (architecture mapped onto the contract — does NOT re-pick vendors)
- **`design_critic`** — enforces tier-appropriate architecture (no microservices on `preview`)
- **`ux-designer`** → `docs/03b-ux-design.md` (design system, wireframes, theme config matching `contract.frontend.css`)

### A.6 Human checkpoint 2 — visual target

Surfaced: competitor teardown screenshots + design rubric scores. Confirm or revise.

### A.7 Phases 6.7–6.8 — Auth and AI (NEW, sequential before fan-out)

- **`auth-engineer`** → scaffolds the auth provider named in `contract.auth.default` (Lucia / Clerk / Supabase Auth / Auth0). Replaces hand-rolled JWT.
- **`ai-features`** (only if `ai_heavy: true`) → RAG pipeline, embeddings table, prompt versioning under `src/prompts/`, eval harness in `evals/`, token cost ledger

Both write into `docs/04-dev-plan.md` so the parallel implementers
can wire against the established infrastructure.

### A.8 Phase 7 — Implementation fan-out (parallel, ≈ 1–4 hours)

Three subagents run **in parallel** in a single message:

- **`backend-developer`** → API routes, validators, services, integrations
- **`frontend-developer`** → component library, pages, state, forms, accessibility
- **`db-migrator`** → migrations + seed data

All three read `docs/00-tech-stack.md` first and refuse vendors not in
the contract.

### A.9 Phase 8 — Quality gates

```bash
scripts/quality-gates.sh
```

Layered hard gates:

```
typecheck → lint → unit → mutation ≥ 70% → integration → contract → e2e → a11y → lighthouse → visual
```

Failures route via `scripts/route-failure.sh --gate <g> --area <path>`
back to the responsible skill. After 3 failed attempts on the same
gate, the orchestrator stops and surfaces to you.

### A.10 Phases 9–11 — Adversarial, security, dogfood

- **`adversarial-tester`** → property-based tests, fuzz, boundary cases (different model from implementer, breaks monoculture)
- **`security-auditor`** → npm audit, secret scan, OWASP review (Critical/High at `launch+`)
- **`dogfood`** → boots dev server, drives wedge workflow in a real browser via the `browse` skill, scores 0–10. Routes:
  - SHIP (≥ 9) → advance
  - POLISH (7–9) → loop to `frontend-developer` once
  - LOOP (5–7) → loop to `ux-designer` + `frontend-developer`
  - RETHINK (< 5) → loop to `designer` (architecture problem)

### A.11 Phases 12–13 — Pricing, positioning, landing page

- **`pricing`** → `docs/16-pricing.md` (2–3 tiers, Stripe/Paddle per contract)
- **`positioning`** → `docs/17-positioning.md` (one-line value prop, hero copy)
- **Human checkpoint 3** — confirm tiers + headline
- **`landing-page`** → public marketing page

### A.12 Phases 15–18 — Ops (launch+ only)

- **`background-jobs`** → BullMQ + Redis (or cloud-tasks/sqs at scale)
- **`env-manager`** + **`cicd`** → Buildkite pipeline, Dockerfile, env separation
- **`deployer`** → Terraform IaC for Cloud Run / ECS (per contract)
- **`observability`** → pino, Sentry/Cloud Monitoring, health checks, SLO dashboards
- **`production-readiness`** → backup/DR, SSL, secrets rotation, status page, go/no-go checklist

### A.13 Phase 19 — Preview ship

Tier-dependent deploy. For `launch`: Buildkite runs CI → Cloud Run
deploy → canary check via `qa` subagent against the deployed URL.

### A.14 Human checkpoint 4 — GO/NO-GO

Last gate before public exposure. Look at the canary result, the
production-readiness checklist, and the dogfood score. Confirm or
abort.

### A.15 Phase 20 — Analytics, then handoff to iteration

- **`analytics`** → instruments PostHog (or contract.analytics.product)
  on the wedge workflow
- The orchestrator schedules `signal-iterate` weekly:
  ```
  /schedule signal-iterate weekly
  ```

### A.16 Total time

Realistic: **3–8 hours of clock time** for the orchestrator (most of
which is sub-agent inference); ~30 min of human time spent at the four
checkpoints. The build is not interactive between checkpoints.

---

## Workflow B — Iterate from a new market analysis

> **Use this when:** Competitors launched, market conditions shifted,
> you suspect the wedge is no longer right, or it's been a quarter and
> you want to refresh the strategic picture. The product already
> exists.

There are **two** modes for this. Pick based on whether the wedge
itself is up for revision.

### B.1 Mode 1 — Refresh, but the wedge survives

Use **`/iterate`**. It re-scans the market, gap-analyzes against the
current implementation, plans new requirements, implements them,
verifies tests.

```
/iterate                        # full re-analysis
/iterate "competitor X just launched feature Y"   # focused
```

What it does (`docs/iterate/SKILL.md`):

1. **Phase 1** — re-reads `docs/01-market-analysis.md`, web-searches
   for new competitors / pricing / regulatory changes / user feedback
   patterns. Appends an **Iteration N Update** section.
2. **Phase 2** — gap analysis: every FR/NFR mapped to
   Implemented / Partial / Missing / Divergent. Writes
   `docs/06-gap-analysis.md`.
3. **Phase 3** — appends new tagged-`[Iteration N]` requirements to
   `02-system-requirements.md` and tasks to `04-dev-plan.md`. Does
   **not** modify previously-completed work.
4. **Phase 4** — implements each new task, tests-driven, until green.
5. **Phase 5** — full verification: unit + integration + smoke + E2E
   + security re-check + perf spot-check.
6. **Phase 6** — appends to `docs/06-iteration-log.md`.

`/iterate` does not touch `docs/00-tech-stack.md` or `docs/01c-wedge.md`.
The wedge and stack stay frozen.

### B.2 Mode 2 — The wedge itself needs revising

Use the orchestrator with a "revise" intent:

```
/build-product-v2 --revise-from differentiation \
  "the wedge needs to shift from depth-for-niche to integrations because <reason>"
```

(If the orchestrator doesn't accept that flag in your version, just
re-run `/differentiation` directly with an axis hint, then manually
trigger `/tech-stack-selector` if the stack constraints changed.)

This re-runs:

1. `differentiation` — produces a new `docs/01c-wedge.md`.
2. **Human checkpoint 1** — confirm the new wedge. **Mandatory.**
3. `tech-stack-selector` — refreshes `docs/00-tech-stack.md`. If the
   constraints changed (e.g. `ai_heavy` flipped on), the contract
   gains pgvector, AI cost tracking, etc.
4. The `iterate` skill picks up from there to land the implementation
   delta.

Critical: revising the wedge mid-product is expensive. Most market
shifts only need Mode 1.

### B.3 When to use Mode 1 vs Mode 2

| Signal | Mode |
|---|---|
| New competitor copied a feature you already have | Mode 1 — narrow gap-fill |
| Pricing in your market dropped 50% | Mode 1 if you can match; Mode 2 if you can't |
| Your wedge axis was speed and a competitor became 2× faster | Mode 2 — pick a new axis |
| Regulation changed (e.g. EU AI Act enforcement) | Mode 2 — the `regulated` constraint flips |
| Users said "we'd pay 10× more for X" | Mode 1 (add X) |
| Quarterly review, no fires | Mode 1 |

### B.4 After either mode

The pipeline ends with `analytics` and re-schedules `signal-iterate`.

---

## Workflow C — Iterate from a specific idea or requirement

> **Use this when:** You know what you want to add or change. The
> change came from a real signal, a user, an internal idea, or a bug.
> Scope is small (one feature, one fix, one polish pass).

Three sub-paths. Pick by source of the idea.

### C.1 The idea came from real user signal

This is the **default path** post-launch. Use **`/signal-iterate`**.

```
/signal-iterate                       # use all wired signals
/signal-iterate "posthog"             # behavior signals only
/signal-iterate "sentry-only"         # failure signals only
```

What it does (signal hierarchy, in order of trust):

1. **Behavior** (PostHog funnels, retention, session recordings) — what users *did*
2. **Failures** (Sentry, observability, failed jobs) — what broke
3. **Voice** (support tickets, NPS, in-app feedback) — what users *said*
4. Market — only if 1–3 are exhausted

It then forces a single answer to:

> What is the one change that, if shipped this iteration, would move
> the most-leaking step of the wedge funnel by ≥ 5 percentage points?

**Not five changes. One.** It also re-checks kill switches from
`01c-wedge.md`. If a switch is tripped (e.g. trial-to-paid below the
threshold for 30 days) it stops the loop and recommends pivot / narrow
/ shutdown.

If `signal-iterate` exits with `Status: PROPOSED`, the change is
described in `docs/iteration-N/the-one-change.md` with predicted lift,
success metric (queryable in PostHog), and kill criterion. The
implementer (`backend-developer` or `frontend-developer`) is spawned
sequentially.

The "Measured lift" field is filled in by **iteration N+1** — that's
the self-correcting loop.

### C.2 The idea came from you (founder / PM / engineer)

You skip the signal pull. Two options:

**Option C.2.a — Lightweight, you know exactly what to build:**

```
/backend-developer "add export-to-CSV for the invoices listing endpoint"
/frontend-developer "add the export button + download progress modal"
```

Each implementer reads `docs/00-tech-stack.md` first, then implements
the feature with tests, and commits. Use `/dogfood` after to verify in
a browser.

**Option C.2.b — The idea is a feature, not a one-liner:**

Use `/iterate` with a focus area:

```
/iterate "add team accounts with role-based permissions"
```

The skill will:
1. Web-search for similar features in competitors (briefly)
2. Append the new requirements to `02-system-requirements.md` tagged `[Iteration N]`
3. Update `04-dev-plan.md` with implementation tasks
4. Implement + test until green

This is heavier than C.2.a and lighter than B.1 (no full market re-scan).

### C.3 The idea is a bug fix or polish

```
/investigate "users are getting 502 on the bulk import endpoint"
/qa                                    # full QA test/fix loop
/design-review                         # visual polish
```

These are gstack skills. They are surgical — no orchestrator, no new
docs, no spec churn. Read the existing code, find the root cause, fix
it, verify it.

### C.4 Decision tree

```
Does the change come from a real user signal (PostHog/Sentry/support)?
  yes → /signal-iterate
  no  → Is it a bug or visual polish?
          yes → /investigate or /qa or /design-review
          no  → Is it a one-line feature?
                  yes → direct /backend-developer or /frontend-developer
                  no  → /iterate "<focus area>"
```

---

## Workflow D — Explore all the ways of using the skills

This section is the systematic tour. Five invocation patterns,
twelve combinations, five anti-patterns.

### D.1 The five invocation patterns

#### Pattern 1 — Orchestrated build

```
/build-product-v2 "<idea>"
```

Runs the state machine, four human checkpoints, full quality gates.
Use for **net-new products**. Approx. cost: $5–30 in inference,
3–8 hours wall-clock.

#### Pattern 2 — Direct skill (single phase, no orchestrator)

```
/<skill-name> [args]
```

Examples:

```
/ceo "AI-powered grant-finder for academic researchers"
/differentiation "depth-for-niche"
/tech-stack-selector
/designer
/auth-engineer
/cicd
/deployer
```

The skill runs as if invoked by the orchestrator but without state
tracking, critic gates, or human checkpoints. Use for **filling
gaps** in a partially-built project, **redoing** a single phase, or
**learning** what a skill does without committing to the full pipeline.

#### Pattern 3 — Skill stack (manually composed sequence)

You drive the sequence yourself:

```
/ceo "<idea>"
# read docs/01-market-analysis.md, edit if needed
/differentiation "speed"
# inspect docs/01c-wedge.md
/tech-stack-selector
/product-spec
/analyst
# stop here, build by hand from docs/02-system-requirements.md
```

Use when you want full control of the strategic phases but plan to
implement by hand.

#### Pattern 4 — Iteration loop (post-launch)

```
/iterate                      # market-driven
/signal-iterate               # signal-driven (preferred post-launch)
```

Use weekly or on cadence. `signal-iterate` is the default post-launch
loop because it works from evidence; `iterate` is the fallback when
no signal infrastructure is wired.

#### Pattern 5 — gstack augment (cross-cutting helpers)

These are project-agnostic and complement the build pipeline:

```
/browse <url>                 # headless browser for QA
/qa                           # find + fix bugs
/qa-only                      # report only, no edits
/design-review                # visual polish on a live site
/investigate "<bug>"          # systematic root-cause debugging
/codex review                 # second-opinion code review
/cso                          # security audit
/review                       # pre-PR review of current diff
/ship                         # commit, bump VERSION, push, open PR
/land-and-deploy              # merge PR, watch CI, canary check
/canary                       # post-deploy live monitoring
/benchmark                    # web-vitals + bundle-size baselines
/retro                        # weekly engineering retro
/document-release             # post-ship docs sync
```

### D.2 The twelve common combinations

| # | When | Combo |
|---|---|---|
| 1 | New product, full build | `build-product-v2` |
| 2 | New product, you control strategy | `ceo` → edit → `differentiation` → edit → `tech-stack-selector` → `build-product-v2 --resume` |
| 3 | New product, prototype only | `build-product-v2` with `tier=toy` |
| 4 | Existing repo, add a feature | `iterate "<feature>"` |
| 5 | Existing repo, signal-driven feature | `signal-iterate` |
| 6 | Existing repo, fix a bug | `investigate` → fix → `qa` → `ship` |
| 7 | Pre-launch polish | `dogfood` → `design-review` → `qa` |
| 8 | Pre-PR safety net | `review` → `codex review` → `cso` |
| 9 | Post-deploy verification | `canary` → `benchmark` |
| 10 | Visual audit on live site | `design-review` |
| 11 | Stack drift — refresh contract | `tech-stack-selector` (rerun) |
| 12 | Quarterly review | `retro` → `iterate` → `cso` |

### D.3 Pipeline-level utilities

The orchestrator and skills assume these exist in `scripts/`:

| Script | Purpose |
|---|---|
| `state-init.sh "<idea>"` | Create / upgrade `state/state.json` |
| `state-set.sh '<jq path>' '<json value>'` | Atomic state field write |
| `state-decide.sh <phase> "<decision>" "<reason>"` | Append a one-line ADR |
| `quality-gates.sh [--only x,y] [--skip z] [--keep-going]` | Layered hard gates |
| `route-failure.sh --gate <g> --area <path>` | Map gate failure → owner skill |

You can call these directly from a manual flow. `quality-gates.sh` in
particular is useful as a pre-merge sanity check even outside the
orchestrator.

### D.4 The four anti-patterns (don't do these)

1. **Don't edit `docs/00-tech-stack.md` ad-hoc** without rerunning
   `tech-stack-selector`. Downstream skills treat it as the contract;
   silent edits cause drift.
3. **Don't skip dogfood.** The skill exists because UI tests don't catch
   feel-bad bugs. Forty-five seconds in a real browser saves a week of
   "production looks weird."
4. **Don't run `iterate` weekly when `signal-iterate` is wired.**
   Calendar-based iteration drifts away from what users actually need.
   Use signals.
5. **Don't run Terraform on `preview` tier.** The pipeline is structured
   to skip it on purpose. Vercel/Fly is the right answer until you have
   paying customers.

### D.5 Skill categories at a glance

```
Strategy         → ceo, differentiation, product-spec, analyst, pricing, positioning
Stack contract   → tech-stack-selector
System design    → designer, ux-designer
Implementation   → backend-developer, frontend-developer, db-migrator,
                   auth-engineer, ai-features, background-jobs,
                   email-templates, api-docs, analytics, observability,
                   landing-page, legal-compliance
Testing          → e2e-tester, perf-tester, adversarial-tester,
                   security-auditor, dogfood
Ops              → cicd, deployer, env-manager, rollback, production-readiness
Iteration        → iterate, signal-iterate
Review / QA      → reviewer, review, codex, cso, design-review, qa, qa-only
Polish / debug   → investigate, design-review, browse
Shipping         → ship, land-and-deploy, canary, benchmark
Docs / retro     → document-release, retro
Safety           → careful, freeze, unfreeze, guard
Orchestration    → build-product-v2 (canonical)
```

---

## Skill reference

### Build-product skills (33)

| Skill | Reads | Writes | Owner of |
|---|---|---|---|
| `ceo` | idea | `01-market-analysis.md` | TAM/SAM/SOM, competitors, wedge candidates |
| `differentiation` | `01` | `01c-wedge.md` (wedge + stack constraints) | Wedge axis, ICP, scale tier |
| `tech-stack-selector` | `01c` | **`00-tech-stack.md`** | The binding stack contract |
| `product-spec` | `00, 01, 01c` | `01b-product-spec.md` | PRD, KPIs |
| `analyst` | `00, 01, 01b, 01c` | `02-system-requirements.md` | FRs, NFRs (IEEE 830) |
| `designer` | `00, 01b, 01c, 02` | `03-system-design.md` | Architecture mapped onto contract |
| `ux-designer` | `00, 01b, 01c, 03` | `03b-ux-design.md` | Design system, wireframes |
| `auth-engineer` | `00, 01c, 02, 03` | auth code | Lucia/Clerk/Supabase Auth/Auth0 |
| `ai-features` | `00, 01c, 02, 03` | `src/lib/ai/`, `src/prompts/`, `evals/` | RAG, prompts, eval, cost tracking |
| `backend-developer` | `00, 01c, 02, 03` | code, `04-dev-plan.md` | API routes, services, integrations |
| `frontend-developer` | `00, 01c, 03, 03b` | code | Pages, components, state |
| `db-migrator` | `00, 03` | migrations, seed | Schema evolution |
| `api-docs` | code, `02, 03` | `07-api-reference.md`, OpenAPI | API documentation |
| `email-templates` | `00, 02, 03, 03b` | email service | Transactional emails |
| `background-jobs` | `00, 02, 03` | job queue setup | Async processing |
| `analytics` | `00, 01b, 01c, 02` | analytics SDK | Event tracking |
| `observability` | `00, 02, 03` | logging, health checks, dashboards | SRE tooling |
| `e2e-tester` | code, `02` | `e2e/`, Playwright config | E2E test suite |
| `perf-tester` | code | `10-performance-report.md`, k6 | Load tests, bundle analysis |
| `adversarial-tester` | code, `02, 03` | `tests/adversarial/`, `08b` | Property/fuzz/boundary tests |
| `security-auditor` | code, `00, 03` | `09-security-audit.md` | OWASP, CVEs, secrets scan |
| `dogfood` | running app, `01c, 03b` | `dogfood/`, `dogfood/iter-N.md` | Real-browser wedge walk |
| `legal-compliance` | code, `02, 03` | legal pages, consent banner | GDPR, ToS, privacy |
| `pricing` | `01, 01b, 01c` | `16-pricing.md` | 2–3 tiers, trial mechanics |
| `positioning` | `01c, 01b, 16` | `17-positioning.md` | Hero copy, value prop |
| `landing-page` | `00, 01c, 03b, 16, 17` | landing page | Public marketing |
| `cicd` | `00, 03, 04` | `.buildkite/` (or alt), Dockerfile | CI/CD pipeline |
| `env-manager` | `00, 03` | `.env`, secrets references | Env separation |
| `deployer` | `00, 03, state` | `infra/` or `vercel.json`/`fly.toml` | Tier-aware deploy |
| `rollback` | deploy state | rollback runbook | Deploy safety |
| `production-readiness` | all | `18-production-readiness.md` | PRR checklist |
| `iterate` | all docs, code | `06-iteration-log.md`, `06-gap-analysis.md` | Market-driven iteration |
| `signal-iterate` | analytics, `01c` | `iteration-N/...` | Signal-driven iteration |
| `reviewer` | code | `05-code-review.md` | Code review (full repo) |
| `build-product-v2` | idea | state machine + all of above | The canonical orchestrator |

### gstack skills (cross-cutting)

| Skill | Use |
|---|---|
| `browse` | Headless browser for QA / dogfood |
| `qa` | Find + fix bugs |
| `qa-only` | Report bugs without fixing |
| `design-review` | Visual polish on live site |
| `plan-design-review` | Design critique on a plan, pre-implementation |
| `plan-ceo-review` | Strategy critique on a plan |
| `plan-eng-review` | Architecture critique on a plan |
| `autoplan` | Run all three plan reviews automatically |
| `office-hours` | Brainstorm/ideation before code |
| `design-consultation` | Create DESIGN.md from scratch |
| `investigate` | Root-cause debugging |
| `codex` | Second-opinion code review (independent model) |
| `review` | Pre-PR review of current diff |
| `cso` | Security audit (daily / comprehensive) |
| `ship` | Commit + bump + push + PR |
| `land-and-deploy` | Merge + CI + canary |
| `canary` | Post-deploy monitoring |
| `benchmark` | Performance baselines |
| `retro` | Weekly engineering retrospective |
| `document-release` | Post-ship docs sync |
| `careful` / `guard` | Prod safety modes |
| `freeze` / `unfreeze` | Restrict edits to a directory |
| `setup-deploy` / `setup-browser-cookies` | Configuration helpers |
| `gstack-upgrade` | Upgrade gstack itself |

---

## File map

What gets written where during a full build:

```
docs/
  00-tech-stack.md            ← tech-stack-selector  (THE CONTRACT)
  01-market-analysis.md       ← ceo
  01b-product-spec.md         ← product-spec
  01c-wedge.md                ← differentiation      (WEDGE + STACK CONSTRAINTS)
  02-system-requirements.md   ← analyst
  03-system-design.md         ← designer
  03b-ux-design.md            ← ux-designer
  04-dev-plan.md              ← backend/frontend/auth/ai-features (live)
  05-code-review.md           ← reviewer
  06-iteration-log.md         ← iterate / signal-iterate
  06-gap-analysis.md          ← iterate
  07-api-reference.md         ← api-docs
  08b-adversarial-report.md   ← adversarial-tester
  09-security-audit.md        ← security-auditor
  10-performance-report.md    ← perf-tester
  16-pricing.md               ← pricing
  17-positioning.md           ← positioning
  18-production-readiness.md  ← production-readiness
  iteration-N/                ← signal-iterate (per-iteration folder)

state/
  state.json                  ← scripts/state-init.sh (orchestrator state)

src/                          ← backend-developer, frontend-developer, auth-engineer, ai-features
prisma/ (or db/)              ← db-migrator
e2e/                          ← e2e-tester
tests/adversarial/            ← adversarial-tester
src/prompts/                  ← ai-features
evals/                        ← ai-features
infra/                        ← deployer (launch+ tier)
.buildkite/                   ← cicd (default)
.github/workflows/            ← cicd (alternative if contract.ci.provider=github-actions)
Dockerfile                    ← cicd
vercel.json or fly.toml       ← deployer (preview tier)
dogfood/                      ← dogfood
```

---

## Troubleshooting

### "ERROR: run `tech-stack-selector` first"

A skill exited because `docs/00-tech-stack.md` doesn't exist. Run:

```
/tech-stack-selector
```

You need a `docs/01c-wedge.md` first, which means `differentiation`
must have run.

### A vendor I don't want shows up in the contract

Either:
1. Edit `docs/00-tech-stack.md` directly (acceptable for one-off tweaks), OR
2. Rerun `/tech-stack-selector` with an argument hint forcing the constraint that biases away from it.

After editing, downstream skills will respect the new contract.

### A skill substituted a different vendor than the contract names

This is a bug. Skills are required to read `docs/00-tech-stack.md` first
and refuse silent substitution. Open `docs/04-dev-plan.md`, search for
`STACK_GAP:` — that's how skills are supposed to surface gaps. If the
skill substituted without surfacing, file an issue.

### Quality gates loop forever

Cap is 3 attempts per gate. After 3, the orchestrator should stop and
surface to you. If it didn't, run:

```
scripts/quality-gates.sh --keep-going    # see all failures
```

Then fix manually or invoke the failing gate's owner skill directly.

### Cloud provider was auto-detected wrong

`tech-stack-selector` and `deployer` use `gcloud` / `aws` CLI presence
to bias the choice. Override by editing `docs/00-tech-stack.md`'s
`cloud.provider` and re-running `/deployer`.

### CI is too expensive

Buildkite is the default precisely for cost. If `tech-stack-selector`
chose `github-actions`, edit the contract — the `stack_critic` should
have caught it but may have been overridden. For an org with
`$BK_API_TOKEN` set, the right answer is almost always Buildkite.

### Iteration broke an existing test

`/iterate` is required to keep all tests green. If a test broke and
the skill marked the task done anyway, that's a bug — the loop has
"do NOT mark task complete unless tests pass." Re-run with the focus
hint that names the broken test.

### `signal-iterate` says no signals available

Wire one of these and re-run:

- `POSTHOG_API_KEY` (preferred — behavior signal)
- `SENTRY_API_TOKEN` (fallback — failure signal)

If you can't wire either, fall back to `/iterate`. But know that you're
inverting the signal hierarchy — calendar-driven instead of
evidence-driven.

### A kill switch tripped

`signal-iterate` Phase 5 stops the loop when a kill switch from
`docs/01c-wedge.md` trips. Read `docs/iteration-N/kill-switch-tripped.md`.
The recommendation will be one of: pivot (rerun `/differentiation`
with a new axis), narrow (re-scope ICP further), or shut down. This
is the only skill allowed to recommend shutdown.

---

## Appendix — Stack contract quick reference

The contract at `docs/00-tech-stack.md` is the single source of truth.
Default 2026-Q2 for `preview` tier:

```yaml
runtime:    typescript, node 22, pnpm
frontend:   react 19, next 15 (app router), tailwind 4, shadcn-ui, react-hook-form
backend:    next-api-routes, prisma 5, zod 3
database:   postgres 16  (pgvector if ai_heavy)
cache:      redis 7  (only required at launch+ or with queue)
queue:      bullmq  (only required at launch+ if async needs)
testing:    vitest, playwright, k6, stryker, fast-check
auth:       lucia (default)  | clerk (b2b multi-tenant) | auth0 (regulated)
ai:         anthropic; pgvector; promptfoo evals
email:      resend (sendgrid retired)
analytics:  posthog
payments:   stripe (paddle if eu_global_billing)
observability: pino + sentry
ci:         buildkite (cost-effective default)
deploy:     vercel (preview) | cloud-run (launch) | cloud-run-multi-region (scale)
cloud:      gcp (default; aws alternative)
iac:        terraform (launch+ only)
security:   argon2id passwords (bcrypt retired)
```

`not_in_stack` (retired defaults — skills will refuse these):

```yaml
- kubernetes (cloud-run is sufficient at preview tier)
- graphql (rest + zod end-to-end is simpler)
- microservices (single-flow MVP, monolith wins)
- sendgrid (resend is the 2026 default)
- bcrypt-as-default (argon2id wins)
- github-actions (buildkite is cheaper at this org)
```

To change anything: rerun `/tech-stack-selector` or edit
`docs/00-tech-stack.md` directly. Quarterly review default: 90 days
from contract date.

---

*End of manual.*
