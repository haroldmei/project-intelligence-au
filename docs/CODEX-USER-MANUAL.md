# Codex Skills User Manual

**Last reviewed:** 2026-04-28  
**Audience:** team members using Codex in this repository  
**Primary skill directory:** `.codex/skills/`  
**Canonical orchestrator:** `build-product-v2`

This manual explains how to use the local Codex skills and orchestrators in this repo. It is based on the current `.codex/skills` inventory, the orchestration scripts in `scripts/`, and the current state files in `state/`.

## Quick Start

Use Codex skills by naming them directly in your request. The clearest format is:

```text
Use $build-product-v2 to build "AI-powered invoice reconciliation for solo bookkeepers serving Shopify DTC brands".
```

For targeted work:

```text
Use $frontend-developer to implement the dashboard from docs/03b-ux-design.md and run component tests.
```

For review and verification:

```text
Use $security-auditor to audit auth, secrets, dependencies, and HTTP security headers. Fix Critical and High issues only.
```

Do not use the Claude or Gemini syntax from the older manuals as Codex guidance. In Codex, prefer `$skill-name` or a plain request that explicitly names the skill. Slash commands like `/build-product-v2` are Claude/Gemini conventions in the existing docs, not the safest Codex convention.

## Review Summary

The Codex skill set is strong enough to support a gated product-building workflow, but the team needs clear routing rules to avoid duplicated or stale paths.

| Finding | Impact | Team rule |
|---|---|---|
| `build-product-v2` is the best orchestrator. | It uses a state-machine model, critic gates, scale-tier branching, and failure routing. | Use `build-product-v2` for new products and major end-to-end builds. |
| `build-product` is broader and older. | It contains a long single-pass sequence and some phase numbering drift. | Use only when you intentionally want the legacy full waterfall. |
| Some skills overlap. | Team members may invoke the wrong skill and get duplicate docs or conflicting advice. | Use the routing tables in this manual. |
| Existing manuals are Claude/Gemini oriented. | They mention `.claude/skills`, `.gemini`, slash commands, and Gemini scripts. | Treat this file as the Codex-specific manual. |
| Some `.codex/skills` directories may be untracked locally. | New team members may not receive all skills from Git by default. | Before onboarding, verify `.codex/skills` is present or install the skills into each member's Codex environment. |
| Ops skills can touch external systems. | CI, cloud, billing, email, and deployment work can cost money or mutate remote resources. | Require explicit human approval before remote mutation, spending money, or deployment. |
| Quality gates are capability-based. | `scripts/quality-gates.sh` skips unavailable tools, so "green" may not mean full coverage. | Read the gate output and add missing tooling before treating the run as release-grade. |

## Mental Model

Codex skills are local instruction packs. Each skill lives in:

```text
.codex/skills/<skill-name>/SKILL.md
```

Each `SKILL.md` defines:

| Field | Meaning |
|---|---|
| `name` | The skill name to invoke, for example `$backend-developer`. |
| `description` | When Codex should use the skill. |
| Body | The workflow, required inputs, expected outputs, quality bar, and validation steps. |

Think of the skill system as three layers:

| Layer | Purpose | Examples |
|---|---|---|
| Orchestrators | Coordinate multi-phase work and route failures. | `build-product-v2`, `build-product`, `iterate`, `signal-iterate` |
| Specialist skills | Own one bounded product, design, engineering, QA, or launch domain. | `ceo`, `frontend-developer`, `security-auditor`, `pricing` |
| Support scripts and state | Persist decisions and run verification outside the model. | `state/state.json`, `scripts/quality-gates.sh`, `scripts/route-failure.sh` |

The most important rule: artifacts are handoffs. Skills should not just "think"; they should write or update files that the next skill can verify.

## Canonical Orchestrator

Use `build-product-v2` unless there is a specific reason not to.

`build-product-v2` treats product building as a state machine:

1. Market analysis
2. Wedge and differentiation
3. Tech stack contract
4. Product spec
5. Requirements
6. System design
7. UX design
8. Auth and foundations as needed
9. Implementation
10. API docs, E2E, and quality gates
11. Adversarial and security review
12. Dogfood
13. Pricing, positioning, and launch prep
14. Signal-driven iteration after usage data exists

It maintains or expects these artifacts:

| Artifact | Purpose |
|---|---|
| `state/state.json` | Current phase, phase status, scale tier, wedge, open issues, decisions. |
| `docs/00-opportunity-scorecard.md` | Opportunity framing and scorecard. |
| `docs/00-checkpoints.md` | Gate decisions and critic verdicts. |
| `docs/01-market-analysis.md` | Market evidence and competitor analysis. |
| `docs/01b-product-spec.md` | PRD, personas, story map, MVP, metrics. |
| `docs/01c-wedge.md` | Narrow ICP, wedge, axis, anti-axis, kill switches. |
| `docs/00-tech-stack.md` | Binding technology contract for downstream work. |
| `docs/02-system-requirements.md` | Functional and non-functional requirements. |
| `docs/03-system-design.md` | Architecture, data, API, infrastructure, security. |
| `docs/03b-ux-design.md` | UX design system, flows, wireframes, accessibility. |
| `docs/04-dev-plan.md` | Implementation plan and task tracking. |

## When To Use Each Orchestrator

| Situation | Use | Why |
|---|---|---|
| New product from idea to validated build | `build-product-v2` | Best default. It has state, gates, failure routing, and scale-tier branching. |
| Legacy all-in-one build | `build-product` | Long full pipeline with explicit phase detail, but less strict than v2. |
| Post-launch or post-preview improvements from broad evidence | `iterate` | Consumes analytics, support feedback, usability findings, and competitor changes. |
| Improvements from real behavior, failures, and feedback | `signal-iterate` | Best when actual usage signals exist. |
| Evaluate and harden the skill system itself | `agent-evals` | Defines eval suites, regression cases, and release gates for skills. |

Recommended default:

```text
Use $build-product-v2 for "<product idea>". Default to preview tier unless I explicitly choose launch or scale. Stop before remote deployment, spending money, or contacting production services.
```

## Scale Tiers

`build-product-v2` uses scale tier to decide how much operational work is required.

| Tier | Use when | What to expect |
|---|---|---|
| `toy` | Throwaway demo or internal proof of concept. | Minimal docs and implementation, little or no ops work. |
| `preview` | Early product preview, low traffic, learning mode. | Wedge, UX, instrumentation, and quality gates matter most. |
| `launch` | Real customers or paid access. | Adds production readiness, observability, billing, deployment safety, and stronger security expectations. |
| `scale` | Enterprise or multi-region needs. | Adds stricter reliability, operational controls, and rollout gates. |

Default to `preview`. Choose `launch` only when you intend to ship to real users with money, data, or reputation at stake.

## Human Checkpoints

The orchestrator should not blindly continue through major product decisions. Team members should expect to review:

| Checkpoint | Review | Proceed only if |
|---|---|---|
| Wedge checkpoint | ICP, wedge sentence, scale tier, constraints. | The product is narrow, valuable, and not a generic feature pile. |
| Design checkpoint | Primary workflow, UX direction, trust states, accessibility. | The core flow is understandable and better than the status quo. |
| Pricing and positioning checkpoint | Tiers, upgrade triggers, value proposition, hero copy. | The business model and message match the wedge. |
| Ship checkpoint | Quality gates, dogfood score, security, rollback, analytics. | The launch risk is acceptable for the chosen tier. |

## How To Invoke Skills In Codex

Use the exact skill name when you know it:

```text
Use $tech-stack-selector to write docs/00-tech-stack.md from docs/01c-wedge.md. Choose preview-tier defaults and explain every vendor decision.
```

Use plain-language routing when you are not sure:

```text
Review the UI against docs/03b-ux-design.md, check responsive states and accessibility, and write the findings to a design QA report.
```

Codex should route the second request to `design-qa` because the request matches that skill's description.

For API or automation callers, pass the same natural-language instruction as the user message. The important part is that the skill name and expected output are explicit.

## Good Prompt Pattern

Use this structure for reliable skill work:

```text
Use $<skill-name> to <task>.

Inputs:
- <files, docs, product idea, URLs, constraints>

Constraints:
- <tier, stack, permissions, non-goals>

Output:
- <files to create/update>
- <tests or checks to run>
- <what to report back>
```

Example:

```text
Use $backend-developer to implement the API tasks in docs/04-dev-plan.md.

Inputs:
- docs/00-tech-stack.md
- docs/02-system-requirements.md
- docs/03-system-design.md
- docs/04-dev-plan.md

Constraints:
- Do not change the selected stack.
- Do not add background jobs unless required by docs/03-system-design.md.
- Do not contact external services.

Output:
- Implement backend routes, validators, services, and tests.
- Run backend tests and report remaining risks.
```

## Common Workflows

### Workflow A: Build A New Product

Start with:

```text
Use $build-product-v2 to build "a tax-prep co-pilot for solo Shopify bookkeepers".
```

Expected path:

| Stage | Skills likely involved | Main outputs |
|---|---|---|
| Strategy | `ceo`, `customer-research`, `differentiation`, `competitor-monitor` | Market analysis, customer evidence, wedge. |
| Contract | `tech-stack-selector` | Tech stack contract. |
| Product definition | `product-spec`, `analyst` | PRD and requirements. |
| Design | `designer`, `ux-designer`, `ui-design` when domain-specific | System design and UX design. |
| Foundations | `auth-engineer`, `ai-features` when relevant | Auth, AI/RAG, prompt, eval, token-cost foundations. |
| Build | `backend-developer`, `frontend-developer`, `db-migrator`, `background-jobs`, `email-templates` | Working application code. |
| Verify | `api-docs`, `reviewer`, `security-auditor`, `e2e-tester`, `perf-tester`, `adversarial-tester`, `design-qa`, `dogfood` | Test reports, fixes, security audit, dogfood verdict. |
| Launch | `pricing`, `positioning`, `landing-page`, `legal-compliance`, `analytics`, `env-manager`, `cicd`, `deployer`, `observability`, `rollback`, `production-readiness` | Launch assets, ops docs, readiness verdict. |
| Iterate | `feedback-triage`, `signal-iterate`, `iterate`, `growth-experiments` | Prioritized improvements from evidence. |

Team rule: do not proceed from strategy to build until the wedge and tech-stack contract are clear.

### Workflow B: Build One Feature

Use specialist skills rather than the full orchestrator:

```text
Use $frontend-developer to add the onboarding checklist screen described in docs/03b-ux-design.md. Keep the implementation inside the existing design system and run component tests.
```

If backend and frontend both change, split ownership:

```text
Use $backend-developer for the onboarding checklist API and tests. Use $frontend-developer for the UI. Both must read docs/00-tech-stack.md and docs/04-dev-plan.md.
```

### Workflow C: Review Before A PR

Use a layered review:

```text
Use $reviewer to review the codebase for correctness, reliability, requirements coverage, and missing tests. Write findings to docs/05-code-review.md and fix confirmed issues.
```

Then run targeted gates:

```text
Use $security-auditor to check for Critical and High issues only.
Use $adversarial-tester to add boundary, malformed input, authorization abuse, race, and invariant-breaking tests.
Use $e2e-tester to cover the critical user flow in Playwright.
```

### Workflow D: Prepare For Launch

For a preview launch:

```text
Use $analytics to instrument the activation path and define the first-value milestone.
Use $dogfood to run the wedge workflow like a real user and route failures to the owning skill.
Use $production-readiness to produce a GO or NO-GO recommendation for preview tier.
```

For a paid or public launch, add:

```text
Use $env-manager, $cicd, $deployer, $observability, $rollback, $legal-compliance, and $production-readiness for launch-tier readiness. Do not mutate remote cloud, CI, billing, or email resources without explicit approval.
```

### Workflow E: Iterate From Real Signals

Use `signal-iterate` when there is usage data:

```text
Use $signal-iterate to prioritize the next iteration from PostHog, Sentry, support issues, and recent user feedback. Prefer activation and retention fixes before new features.
```

Use `iterate` when the evidence is broader or mostly document/code based:

```text
Use $iterate to compare requirements, implementation, usability findings, and competitor changes. Update the gap analysis, dev plan, tests, and iteration log.
```

## Skill Routing Reference

### Orchestration And Evals

| Skill | Use when | Primary outputs |
|---|---|---|
| `build-product-v2` | You need an end-to-end state-machine product build. | State, checkpoints, docs, implementation, gates. |
| `build-product` | You intentionally want the older gated waterfall. | Full planning, build, launch, iteration artifacts. |
| `agent-evals` | You want to evaluate skill quality and handoffs. | `docs/00-agent-evals.md`, eval cases, regressions. |
| `iterate` | You want a broad refinement cycle. | Gap analysis, iteration log, implementation updates. |
| `signal-iterate` | You have real usage, failure, and feedback signals. | Prioritized signal-driven iteration plan and fixes. |

### Strategy, Market, And Product

| Skill | Use when | Primary outputs |
|---|---|---|
| `ceo` | You need market research and competitor analysis. | `docs/01-market-analysis.md`. |
| `customer-research` | You need ICP, JTBD, pains, and buying-context validation. | Customer research synthesis and interview-ready outputs. |
| `competitor-monitor` | You need ongoing competitor, pricing, positioning, launch, or UX tracking. | Competitive parity and differentiation updates. |
| `differentiation` | You need one ICP, one axis, one narrow workflow wedge. | `docs/01c-wedge.md`. |
| `product-spec` | You need PRD, personas, story map, MVP, metrics. | `docs/01b-product-spec.md`. |
| `pricing` | You need implementation-ready pricing tiers and upgrade triggers. | Pricing guidance, usually `docs/16-pricing.md`. |
| `pricing-strategy` | You need early willingness-to-pay hypotheses. | Packaging and pricing experiment strategy. |
| `positioning` | You need buyer-facing messaging. | `docs/17-positioning.md` or equivalent messaging bank. |
| `launch-strategy` | You need first-30-days launch plan. | Channel, messaging, proof-point, and learning plan. |
| `growth-experiments` | You need acquisition, activation, retention, or conversion experiments. | Experiment plan and instrumentation requirements. |
| `feedback-triage` | You need support issues and complaints turned into product actions. | Prioritized product, UX, and reliability actions. |

### Requirements, Architecture, And UX

| Skill | Use when | Primary outputs |
|---|---|---|
| `tech-stack-selector` | You need a binding downstream stack contract. | `docs/00-tech-stack.md`. |
| `analyst` | You need IEEE-style system requirements. | `docs/02-system-requirements.md`. |
| `designer` | You need system architecture and design. | `docs/03-system-design.md`. |
| `ux-designer` | You need UX design, wireframes, accessibility, Tailwind theme. | `docs/03b-ux-design.md`. |
| `ui-design` | You are working on Anti Plagiarism AI UI specifically. | Production-ready UI screens, flows, tokens, specs. |
| `design-qa` | You need implemented UI checked against the UX spec. | Design QA findings and fix routing. |
| `usability-testing` | You need friction, trust, and time-to-value review. | Usability findings and prioritized fixes. |

### Implementation

| Skill | Use when | Primary outputs |
|---|---|---|
| `developer` | You need a small general implementation pass. | Dev plan, implementation, tests. |
| `backend-developer` | You need API, DB queries, auth integration, services, backend tests. | Backend code and tests. |
| `frontend-developer` | You need components, pages, state, forms, responsive/a11y work. | Frontend code and component/page tests. |
| `db-migrator` | You need schema migrations, seed data, rollback scripts. | Migrations, seed scripts, DB docs/tests. |
| `auth-engineer` | You need auth provider wiring and session/security controls. | Auth flow, sessions, auth tests. |
| `ai-features` | The product wedge depends on AI/RAG/prompts/embeddings/streaming. | AI feature code, prompt management, evals, cost tracking. |
| `background-jobs` | You need queues, cron jobs, retries, workers. | Queue setup, processors, tests, monitoring hooks. |
| `email-templates` | You need transactional email templates and sending service. | Templates, email service, preview/tests. |
| `api-docs` | You need OpenAPI and API reference docs. | `openapi.yaml`, `docs/07-api-reference.md`. |

### Quality, Security, And Verification

| Skill | Use when | Primary outputs |
|---|---|---|
| `reviewer` | You need a comprehensive code review and fixes. | `docs/05-code-review.md`, resolved findings. |
| `security-auditor` | You need dependency, secret, authz, injection, OWASP review. | `docs/09-security-audit.md`, Critical/High fixes. |
| `e2e-tester` | You need Playwright coverage for critical flows and responsive states. | E2E tests and `docs/08-e2e-test-report.md`. |
| `perf-tester` | You need bundle, load, N+1, index, and API latency checks. | `docs/10-performance-report.md`. |
| `adversarial-tester` | Normal tests pass but you want failure-seeking tests. | Boundary, fuzz, race, authz, invariant tests. |
| `dogfood` | You need the actual wedge workflow exercised like a real user. | Dogfood report and route-back decisions. |

### Launch, Ops, And Compliance

| Skill | Use when | Primary outputs |
|---|---|---|
| `landing-page` | You need public SEO marketing page. | Landing page implementation. |
| `analytics` | You need event tracking, funnels, dashboard, privacy-aware analytics. | Tracking plan, instrumentation, dashboard. |
| `legal-compliance` | You need privacy, terms, cookies, retention, deletion/export. | Legal pages and compliance docs. |
| `env-manager` | You need env separation, `.env.example`, typed config, secret handling. | Env docs, config, local dependency setup. |
| `cicd` | You need Buildkite pipeline, Dockerfile, build scripts. | `.buildkite/`, `Dockerfile`, validation. |
| `deployer` | You need Terraform and cloud deployment wiring. | `infra/` and deploy scripts. |
| `observability` | You need logs, health checks, error tracking, alerts, runbooks. | Observability code and `docs/11-observability.md`. |
| `rollback` | You need pre-deploy, verify, rollback scripts and runbook. | Deployment safety scripts and `docs/12-runbook.md`. |
| `production-readiness` | You need final GO/NO-GO review. | `docs/15-production-readiness.md`. |

## Preferred Skill Choices For Overlaps

| If you are choosing between | Prefer | Reason |
|---|---|---|
| `build-product-v2` vs `build-product` | `build-product-v2` | Better control surface, state, gates, and failure routing. |
| `pricing` vs `pricing-strategy` | `pricing` for build/launch, `pricing-strategy` for early exploration. | `pricing` is more implementation-ready. |
| `signal-iterate` vs `iterate` | `signal-iterate` when real usage data exists, otherwise `iterate`. | Signal-driven work should beat speculative iteration. |
| `backend-developer`/`frontend-developer` vs `developer` | Specialist skills for production work. | Clear ownership and better tests. |
| `ux-designer` vs `ui-design` | `ux-designer` for general products. | `ui-design` is domain-specific to Anti Plagiarism AI. |
| `reviewer` vs `adversarial-tester` | Run `reviewer` first, then `adversarial-tester`. | Fix obvious issues before adding failure-seeking coverage. |

## Support Scripts

The orchestrator and manual flows can use these scripts directly.

| Script | Purpose |
|---|---|
| `scripts/state-init.sh "<idea>"` | Initialize or upgrade `state/state.json`, `state/decisions.md`, and `state/signals.json`. |
| `scripts/state-set.sh <jq_path> <json_value>` | Set one field in `state/state.json`. |
| `scripts/state-decide.sh <phase> "<decision>" "<reason>"` | Append a decision to both `state/decisions.md` and `state/state.json`. |
| `scripts/quality-gates.sh` | Run typecheck, lint, unit, mutation, integration, contract, E2E, a11y, lighthouse, and visual gates when configured. |
| `scripts/route-failure.sh --gate <gate> --area <path>` | Map gate failure to the owning skill. |

Common commands:

```bash
scripts/state-init.sh "AI-powered invoice reconciliation for solo bookkeepers"
scripts/state-set.sh '.scale_tier' '"preview"'
scripts/state-decide.sh differentiation "axis = niche-depth" "Shopify DTC bookkeepers are underserved by generalist tools"
scripts/quality-gates.sh --keep-going
scripts/quality-gates.sh --only typecheck,lint,unit
scripts/route-failure.sh --gate e2e --area src/app/onboarding/page.tsx
```

## Quality Gate Interpretation

`scripts/quality-gates.sh` runs these gates in order:

```text
typecheck -> lint -> unit -> mutation -> integration -> contract -> e2e -> a11y -> lighthouse -> visual
```

Important behavior:

| Behavior | Meaning |
|---|---|
| Missing tooling is often skipped. | A pass may mean "nothing configured" for that gate. |
| `--keep-going` reports all configured failures. | Use this before routing work to multiple skills. |
| Logs are written to `/tmp/qg-<gate>.log`. | Read those logs when routing a failure. |
| Mutation threshold defaults to 70. | Override with `MUTATION_THRESHOLD=<n>` when needed. |
| Lighthouse requires `LIGHTHOUSE_URL`. | Without it, that gate does not prove runtime performance. |

Failure routing defaults:

| Gate | Default owner skill |
|---|---|
| `typecheck`, `lint` | Based on path, often `frontend-developer`. |
| `unit` | Based on path, often `backend-developer`. |
| `mutation` | `adversarial-tester`. |
| `integration`, `contract` | `backend-developer`. |
| `e2e`, `visual` | `frontend-developer`. |
| `a11y` | `ux-designer`. |
| `lighthouse` | `perf-tester`. |
| `security-critical` | `security-auditor`. |
| `security-secrets` | `env-manager`. |
| `canary-pipeline` | `cicd`. |
| `canary-infra` | `deployer`. |

## Team Operating Rules

1. Start with the smallest appropriate scope. Use the full orchestrator only for multi-phase product work.
2. Keep `docs/01c-wedge.md` and `docs/00-tech-stack.md` current. Downstream implementation should follow those contracts.
3. Do not let a skill silently substitute vendors or frameworks. If the contract says Prisma, do not accept Drizzle without an explicit decision update.
4. For production work, require tests or verification evidence in the final response.
5. For cloud, CI, billing, email, or deployment work, require explicit approval before remote mutations.
6. For security work, fix Critical and High issues first. Medium and Low should be triaged unless the task explicitly asks for full hardening.
7. For UI work, verify desktop, mobile, loading, empty, error, and disabled states.
8. For AI features, require prompt versioning, evals, and token-cost visibility. Do not ship opaque model behavior.
9. For post-launch iteration, prefer observed user behavior over speculative feature ideas.
10. Keep decision records short and concrete in `state/decisions.md`.

## Onboarding Checklist For New Team Members

1. Confirm the repo has `.codex/skills/`.
2. Open `.codex/skills/build-product-v2/SKILL.md` and read the operating model.
3. Open `.codex/skills/tech-stack-selector/SKILL.md` and understand the stack contract.
4. Open `.codex/skills/differentiation/SKILL.md` and understand the wedge discipline.
5. Read `scripts/quality-gates.sh` so you know what "green" actually means.
6. Run `git status --short` and check whether local skill changes are tracked or untracked.
7. For a new product, ask Codex to use `$build-product-v2`.
8. For a targeted task, pick one specialist skill from the routing reference.
9. Before accepting a build, ask for verification commands and residual risks.

## Skill Maintenance

When editing a skill:

1. Edit only `.codex/skills/<skill-name>/SKILL.md` unless you are intentionally changing another environment.
2. Keep the `name` stable unless you are ready to update every reference.
3. Keep the `description` specific because Codex uses it for routing.
4. Make required inputs and outputs explicit.
5. Add validation steps and failure modes.
6. If the skill writes files, list exact target paths.
7. If the skill can mutate external systems, require explicit user approval in the skill body.
8. After changing skill behavior, run or update `agent-evals`.

Recommended eval prompt after skill changes:

```text
Use $agent-evals to review the changed Codex skills. Focus on orchestration regression, handoff correctness, tool usage, safety/permissions, and artifact completeness.
```

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Codex did not use the intended skill. | The prompt was too vague or omitted the skill name. | Re-run with `Use $<skill-name> to ...` and list inputs/outputs. |
| A skill wants a missing doc. | The upstream phase has not run or the file was renamed. | Run the upstream skill or provide the missing context explicitly. |
| Two skills give conflicting advice. | Overlapping responsibilities or stale docs. | Prefer `docs/01c-wedge.md`, `docs/00-tech-stack.md`, and the latest decision record. |
| Quality gates pass too quickly. | Tools are missing and gates were skipped. | Read gate output and configure the missing test/lint/build tool. |
| An implementation ignores the tech stack. | The skill did not read `docs/00-tech-stack.md` or the contract is missing. | Run `tech-stack-selector` and ask the implementer to reconcile against the contract. |
| The product scope keeps expanding. | The wedge is weak or not enforced. | Re-run `differentiation` and update `docs/01c-wedge.md` with non-goals and kill switches. |
| Launch work asks for cloud credentials. | Ops skills are entering launch/scale behavior. | Confirm tier and approve only the specific remote mutation you want. |
| Iteration work is speculative. | No signal sources or feedback were provided. | Use `feedback-triage` first or provide analytics/support/bug evidence. |

## Recommended Team Defaults

Use these defaults unless a project lead says otherwise:

| Decision | Default |
|---|---|
| New product orchestrator | `build-product-v2` |
| Scale tier | `preview` |
| Wedge source of truth | `docs/01c-wedge.md` |
| Stack source of truth | `docs/00-tech-stack.md` |
| State source of truth | `state/state.json` |
| Gate log | `docs/00-checkpoints.md` |
| Quality command | `scripts/quality-gates.sh --keep-going` |
| Post-launch iteration | `signal-iterate` when real signals exist |
| Security rule | Fix Critical/High before launch |
| Remote mutation rule | Explicit human approval required |

## Appendix: Minimal Prompt Library

New product:

```text
Use $build-product-v2 to build "<idea>". Default to preview tier. Keep the MVP narrow, enforce the wedge, and stop before remote deployment or paid services.
```

Market and wedge:

```text
Use $ceo to research "<market>" and write docs/01-market-analysis.md with competitors, pricing, risks, and sourced claims. Then use $differentiation to choose one ICP, one axis, and one wedge.
```

Stack contract:

```text
Use $tech-stack-selector to write docs/00-tech-stack.md from docs/01c-wedge.md and the selected scale tier. Include not_in_stack and implementation constraints.
```

Backend:

```text
Use $backend-developer to implement the backend tasks in docs/04-dev-plan.md. Read docs/00-tech-stack.md first, write unit/integration tests, and run the backend test suite.
```

Frontend:

```text
Use $frontend-developer to implement the UI from docs/03b-ux-design.md. Cover responsive, loading, empty, error, and accessibility states.
```

Database:

```text
Use $db-migrator to reconcile the schema with docs/03-system-design.md, generate migrations, add realistic seed data, and validate rollback safety.
```

Review:

```text
Use $reviewer to review the current implementation for correctness, reliability, requirements coverage, and test gaps. Write docs/05-code-review.md and fix confirmed issues.
```

Security:

```text
Use $security-auditor to audit dependencies, secrets, authn/authz, injection risk, headers, and data protection. Fix Critical and High issues and write docs/09-security-audit.md.
```

Dogfood:

```text
Use $dogfood to run the core wedge workflow as a real user. Capture failures, score the experience, and route fixes to the owning skill.
```

Production readiness:

```text
Use $production-readiness to perform a launch-tier readiness review. Verify backup/DR, SLOs, TLS, secrets, incident response, capacity, legal, CI/CD, observability, and rollback.
```

Signal-driven iteration:

```text
Use $signal-iterate to prioritize the next product iteration from analytics, errors, support feedback, and user complaints. Prefer activation and retention improvements over new feature expansion.
```

