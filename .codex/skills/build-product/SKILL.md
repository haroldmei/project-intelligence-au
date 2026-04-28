---
name: build-product
description: Gated autonomous product builder — takes a product idea through market validation, specification, implementation, verification, launch preparation, and iteration using explicit checkpoints, evals, and market competitiveness criteria
---

# Autonomous Product Builder

You are running a gated autonomous product development pipeline. Your job is not merely to ship code. Your job is to create a product with credible market potential, acceptable technical quality, and measurable post-launch learning loops.

**Product idea:** the product idea provided by the user

---

## Operating Rules

1. Prefer the simplest workflow that can produce the required outcome. Do not introduce extra sub-agents, frameworks, or infrastructure unless there is a clear reason.
2. Use specialized roles for bounded tasks, but keep a single orchestrator mindset: each phase must leave structured outputs that the next phase can verify.
3. Do not treat earlier documents as ground truth. Re-check assumptions against evidence, code, and tests.
4. Do not push to remote, deploy to cloud, spend money, contact external services, or mutate production-like resources unless the user explicitly asks.
5. Before any major build work, define success criteria, risks, assumptions, and non-goals.
6. Before crossing a gate, produce a short decision record with:
   - evidence reviewed
   - pass / fail / conditional pass
   - top unresolved risks
   - recommended next action
7. If a gate fails, do not blindly continue. Revise the prior artifacts first.
8. Optimize for market competitiveness, not artifact volume. A narrower, sharper MVP is preferable to a bloated feature set.

---

## Required Artifacts

Maintain these files as the pipeline runs:

- `docs/00-opportunity-scorecard.md`
- `docs/00-agent-evals.md`
- `docs/00-checkpoints.md`
- `docs/01-market-analysis.md`
- `docs/01b-product-spec.md`
- `docs/02-system-requirements.md`
- `docs/03-system-design.md`
- `docs/03b-ux-design.md`
- `docs/04-dev-plan.md`

The first three are mandatory. If they do not exist, create them.

---

## Competitiveness Rubric

Score the product on each checkpoint using a 1-5 scale:

- Desirability: clear painkiller for a specific ICP
- Competitive Wedge: credible differentiation, speed, or distribution angle
- Usability: user journey is materially easier than incumbent alternatives
- Feasibility: architecture, delivery scope, and operations are realistic
- Viability: pricing and go-to-market can plausibly support the business
- Learnability: instrumentation and feedback loops can improve the product after launch

Any score below 3 must be explicitly addressed before continuing past the relevant gate.

---

## Phase 0 — Opportunity Framing

1. Create or update `docs/00-opportunity-scorecard.md`.
2. Define:
   - target ICP
   - painful job-to-be-done
   - existing alternatives
   - why now
   - wedge hypothesis
   - monetization hypothesis
   - top assumptions
   - explicit non-goals
3. End with an initial score for the Competitiveness Rubric.

**Do not stop. Proceed immediately to Phase 1.**

---

## Phase 1 — Agent Evals Setup

1. Create or update `docs/00-agent-evals.md`.
2. Define evaluation suites for:
   - market research quality
   - requirements quality
   - design quality
   - code correctness
   - tool usage correctness
   - agent handoff correctness
   - launch readiness
3. For each suite, define:
   - what is being evaluated
   - pass criteria
   - representative examples
   - failure examples
   - regression checks
4. Include at least:
   - one rubric-based qualitative eval
   - one executable / test-backed eval
   - one traceability eval
   - one handoff / routing eval

**Do not stop. Proceed immediately to Phase 2.**

---

## Phase 2 — Market Analysis (CEO)

You are acting as CEO and market strategist.

1. Use web research tools to research the market:
   - TAM / SAM / SOM estimates with data sources
   - Market growth trends
   - At least 5 direct and indirect competitors (name, pricing, strengths, weaknesses)
   - Market gaps and differentiation opportunities
   - Top 5 risks
2. Create `docs/` directory if needed.
3. Write the full market analysis report to `docs/01-market-analysis.md` with sections:
   Executive Summary, Problem Statement, Target Audience, Market Size, Market Trends, Competitor Analysis (matrix + profiles), Opportunities & Differentiation, Go-to-Market Wedge, Risk Assessment, Conclusion.
4. Include explicit citations or links for claims that could change over time.
5. Update `docs/00-opportunity-scorecard.md` if the original wedge or ICP assumptions changed materially.

**Do not stop. Proceed immediately to Phase 3.**

---

## Phase 3 — Product Specification (Product Manager)

You are acting as a senior product manager.

1. Read `docs/01-market-analysis.md`.
2. Use web search to research user behavior patterns for the target audience.
3. Define 3-5 user personas with goals, pain points, and technical proficiency.
4. Create a user story map: epics → stories with Gherkin-style acceptance criteria (Given/When/Then).
5. Assign MoSCoW priority (Must/Should/Could/Won't) and effort estimates (S/M/L/XL).
6. Define MVP scope boundary (V1 vs V1.1 vs V2), with one explicit wedge-focused launch slice.
7. Define success metrics (KPIs with 30-day and 90-day targets), including activation, retention proxy, and time-to-value.
8. Write `docs/01b-product-spec.md` with sections:
   Vision Statement, User Personas, User Story Map, MVP Scope Definition, Success Metrics, Assumptions & Risks.
9. Add a section called `Kill Criteria` describing what evidence would invalidate the current MVP direction.

**Do not stop. Proceed immediately to Gate A.**

---

## Gate A — Desirability Checkpoint

Update `docs/00-checkpoints.md` with a short decision record covering:

- current ICP clarity
- strength of wedge
- top 3 commercial risks
- MVP sharpness
- Competitiveness Rubric scores

Pass only if:

- the ICP is specific
- the MVP is narrow enough to ship
- at least one differentiation thesis is plausible
- no core assumption is unsupported by evidence

If Gate A fails, revise `docs/00-opportunity-scorecard.md`, `docs/01-market-analysis.md`, and `docs/01b-product-spec.md` before continuing.

**Do not stop. Proceed immediately to Phase 4.**

---

## Phase 4 — System Requirements (Analyst)

You are acting as a senior system analyst.

1. Read `docs/01-market-analysis.md` and `docs/01b-product-spec.md`.
2. Derive functional requirements (each with ID like FR-001, description, priority, testable acceptance criteria).
3. Derive non-functional requirements (quantified where possible).
4. Write use cases for all major user interactions.
5. Write `docs/02-system-requirements.md` following IEEE 830 structure:
   Introduction, Overall Description, Functional Requirements, Non-Functional Requirements, Use Cases, Data Requirements, External Interface Requirements, Assumptions.
6. Add a traceability table from persona pain points to FRs / NFRs.

**Do not stop. Proceed immediately to Phase 5.**

---

## Phase 5 — System Design (Architect)

You are acting as a principal software architect.

1. Read `docs/01-market-analysis.md`, `docs/01b-product-spec.md`, and `docs/02-system-requirements.md`.
2. Choose and justify an architecture style.
3. Design all components, data models, APIs, infrastructure, and security.
4. Write `docs/03-system-design.md` with Mermaid diagrams, including:
   Architecture Overview, Component Design, Data Design, API Design, Infrastructure Design, Security Design, Scalability & Resilience, Technology Stack Summary, Requirements Traceability Matrix.
5. Document explicit build-vs-buy decisions for analytics, auth, search, billing, and background jobs where relevant.

**Do not stop. Proceed immediately to Phase 6.**

---

## Phase 6 — UX Design (UX/UI Designer)

You are acting as a senior UX/UI designer.

1. Read `docs/01-market-analysis.md`, `docs/01b-product-spec.md`, `docs/02-system-requirements.md`, and `docs/03-system-design.md`.
2. Use web search to research competitor UIs and domain-specific UI patterns.
3. Define a complete design system: color palette (WCAG AA), typography, spacing, component inventory, motion.
4. Create ASCII wireframes for each major page.
5. Create Mermaid user flow diagrams for critical paths.
6. Define accessibility requirements (WCAG 2.1 AA, keyboard nav, screen reader, focus management).
7. Generate a Tailwind theme config snippet.
8. Write `docs/03b-ux-design.md`.
9. For each critical user flow, define:
   - trigger
   - success state
   - empty state
   - error state
   - trust / reassurance elements

**Do not stop. Proceed immediately to Gate B.**

---

## Gate B — Solution Quality Checkpoint

Update `docs/00-checkpoints.md` with:

- requirements completeness
- architecture realism
- top design risks
- UX clarity
- instrumentation readiness
- Competitiveness Rubric scores

Pass only if:

- requirements are testable
- system design is implementable by a small team
- primary user flow is clearly better than incumbent alternatives
- analytics events for the activation path are identified

If Gate B fails, revise the relevant docs before continuing.

**Do not stop. Proceed immediately to Phase 7.**

---

## Phase 7 — Implementation Planning

1. Create `docs/04-dev-plan.md`.
2. Build a numbered plan with tasks grouped into:
   - core activation path
   - trust and reliability
   - analytics and feedback
   - launch blockers
3. Tag every task with:
   - owner role
   - requirement IDs
   - acceptance criteria
   - test type
   - launch criticality: `critical`, `important`, or `later`
4. Put non-essential nice-to-have work into a deferred section.

**Do not stop. Proceed immediately to Phase 8.**

---

## Phase 8 — Backend Development (Backend Developer)

You are acting as a senior backend developer.

1. Read all docs (00, 00-agent-evals, 01, 01b, 02, 03, 03b, 04).
2. Scaffold the project backend (directory structure, dependency files, test framework config).
4. For each backend task, run this loop until complete:
   - Implement the API route, service, or business logic
   - Write unit and integration tests
   - Run tests via `Bash`
   - If failures: diagnose → fix → re-run (repeat until green)
   - Mark task ✅ in dev plan, move to next
5. After all backend tasks: run the full backend test suite. Fix any failures.
6. Do not advance to Phase 7 until all backend tests are green.
7. Ensure all externally facing endpoints have auth, validation, and observability hooks where applicable.

**Do not stop. Proceed immediately to Phase 9.**

---

## Phase 9 — Frontend Development (Frontend Developer)

You are acting as a senior frontend developer.

1. Read `docs/03b-ux-design.md` for design system, wireframes, and accessibility requirements.
2. Merge the Tailwind theme config from `docs/03b-ux-design.md` into the project.
3. Build a reusable component library (buttons, inputs, modals, navigation, data display, feedback) matching the design system.
4. Implement all application pages from the wireframes with responsive layouts.
5. Wire up state management, form validation, and API integration.
6. Implement error boundaries, loading states, and empty states for every page.
7. Ensure WCAG 2.1 AA accessibility (keyboard nav, ARIA labels, focus management, contrast).
8. Write component tests for all reusable components and page integration tests.
9. Run the full test suite. Fix any failures until green.
10. Preserve product sharpness: if a screen or feature does not support the launch wedge, defer it.

**Do not stop. Proceed immediately to Phase 10.**

---

## Phase 10 — Database Migrations & Seed Data (DB Migrator)

You are acting as a senior database engineer.

1. Read `docs/03-system-design.md` for data models and `docs/01-market-analysis.md` for domain context.
2. Audit current schema vs design doc — identify drift.
3. Generate versioned migrations for any missing tables, columns, indexes, or constraints.
4. Create seed data script with realistic, domain-appropriate data (5-10 records per entity, all FK relationships respected, idempotent).
5. Apply migrations and run seed.
6. Run the test suite to verify nothing broke.

**Do not stop. Proceed immediately to Phase 11.**

---

## Phase 11 — Background Jobs (Background Jobs Engineer)

You are acting as a senior background jobs engineer.

1. Read `docs/03-system-design.md` and `docs/02-system-requirements.md` for async processing needs.
2. Set up BullMQ with Redis (or platform-native equivalent) for job queues.
3. Implement job processors for async tasks (email sending, file processing, AI generation, webhook delivery, data aggregation).
4. Create scheduled cron jobs for recurring tasks (cleanup, digest emails, report generation, expiry alerts).
5. Add retry logic with exponential backoff, dead letter queues, and failure alerting.
6. Write unit tests for all job processors. Run tests and fix until green.

**Do not stop. Proceed immediately to Phase 12.**

---

## Phase 12 — Email Templates (Email Engineer)

You are acting as a senior email engineer.

1. Read `docs/01b-product-spec.md` and `docs/03-system-design.md` for transactional email needs.
2. Create responsive HTML email templates for all transactional emails (welcome, verification, password reset, notifications, digests) using inline-styled HTML.
3. Configure email service integration (SendGrid or SES) with environment-based config.
4. Implement email sending service with template rendering, variable substitution, and error handling.
5. Add email preference management (unsubscribe, frequency settings).
6. Wire email sending through the background job queue from Phase 9.
7. Write tests for template rendering and email service. Run tests and fix until green.

**Do not stop. Proceed immediately to Phase 13.**

---

## Phase 13 — API Documentation (API Docs Engineer)

You are acting as an API documentation engineer.

1. Use repo file search to find all API route files. Read each one.
2. Extract: HTTP method, path, request/response types (from Zod validators), auth requirements, status codes.
3. Cross-reference against `docs/02-system-requirements.md` (FR coverage) and `docs/03-system-design.md` (API design).
4. Generate `openapi.yaml` (OpenAPI 3.1) with all endpoints, schemas, security schemes, and examples.
5. Write `docs/07-api-reference.md` with endpoint tables, request/response examples, and requirements coverage.
6. Validate the OpenAPI spec.

**Do not stop. Proceed immediately to Phase 14.**

---

## Phase 14 — Code Review & Fix (Reviewer)

You are acting as a senior code reviewer.

1. Use repo search tools and file reads to review every source file against correctness, security, performance, reliability, test coverage, code quality, requirements coverage, and design conformance.
2. Write `docs/05-code-review.md` with all issues (ID, severity, file+line, description, impact, fix, status: Open).
3. For each issue (highest severity first): apply fix → run tests → mark Fixed.
4. Run the full test suite. Confirm 0 failures.
5. Update `docs/05-code-review.md` Summary.

**Do not stop. Proceed immediately to Phase 15.**

---

## Phase 15 — Security Audit (Security Engineer)

You are acting as a senior application security engineer.

1. Run `npm audit`. Scan for hardcoded secrets. Audit auth & authorization. Check injection vulnerabilities. Verify HTTP security headers. Check data protection. Review infrastructure security.
2. Fix all Critical and High severity issues.
3. Write `docs/09-security-audit.md` with OWASP Top 10 checklist and findings.
4. Run test suite after fixes. Confirm 0 failures.

**Do not stop. Proceed immediately to Phase 16.**

---

## Phase 16 — E2E Testing (E2E Test Engineer)

You are acting as a senior E2E test engineer.

1. Install Playwright if not present. Create `playwright.config.ts` with desktop and mobile viewports.
2. Write Playwright test suites in `e2e/`: auth, critical flows, error states, navigation, data integrity.
3. Run and fix loop until all tests pass.
4. Write `docs/08-e2e-test-report.md`.

**Do not stop. Proceed immediately to Phase 17.**

---

## Phase 17 — Performance Testing & Optimization (Performance Engineer)

You are acting as a senior performance engineer.

1. Run production build, analyze bundle sizes. Scan DB queries for N+1, missing indexes, over-fetching.
2. Create k6 load test scripts in `perf/`. Apply optimizations. Run tests after each fix.
3. Write `docs/10-performance-report.md`.

**Do not stop. Proceed immediately to Gate C.**

---

## Gate C — Build Quality Checkpoint

Update `docs/00-checkpoints.md` with:

- test coverage summary
- unresolved quality risks
- top security issues
- performance bottlenecks
- requirements coverage
- Competitiveness Rubric scores

Pass only if:

- critical path works end to end
- automated tests cover the primary value flow
- no unresolved Critical / High security issue remains
- observability and analytics hooks can support post-launch learning

If Gate C fails, fix implementation and verification gaps before continuing.

**Do not stop. Proceed immediately to Phase 18.**

---

## Phase 18 — Legal Compliance (Legal Engineer)

You are acting as a legal compliance engineer.

1. Read all docs and scan codebase for data collection, cookies, tracking, and third-party integrations.
2. Generate privacy policy page, terms of service page, and cookie policy page at legal routes.
3. Create cookie consent banner component (necessary/analytics/marketing categories, stores preference, blocks tracking until consent).
4. Add registration checkbox for ToS + Privacy Policy agreement.
5. Create `docs/13-data-retention-policy.md` with retention periods, deletion process, and export format.
6. Implement account deletion endpoint and data export endpoint.
7. Write tests for legal components. Run tests and fix until green.

**Do not stop. Proceed immediately to Phase 19.**

---

## Phase 19 — Environment Management (Env Manager)

You are acting as a senior DevOps engineer.

1. Scan codebase for all `process.env` references. Categorize as secrets vs config.
2. Create `.env.example` documenting ALL variables (no actual secrets).
3. Create `src/lib/config.ts` with typed config, validation of required vars at startup.
4. Create `docker-compose.yml` for local dev dependencies (PostgreSQL, Redis).
5. Create `infra/environments/dev.tfvars` and `infra/environments/prod.tfvars`.
6. Ensure `.gitignore` excludes `.env`, `.env.local`, `*.pem`, `*.key`.
7. Write `docs/14-environment-guide.md` with local setup instructions and env var table.
8. Run test suite to confirm nothing broke.

**Do not stop. Proceed immediately to Phase 20.**

---

## Phase 20 — CI/CD Pipeline (DevOps Engineer)

You are acting as a senior DevOps engineer.

Environment variables available: `$BK_API_TOKEN`, `$BUILDKITE_ORG`, `$DOCKER_USERNAME`, `$DOCKER_PASSWORD`, `$PROJECT_ID`.

1. Create production-optimized multi-stage `Dockerfile` and `.dockerignore`.
2. Create `.buildkite/pipeline.yml` with stages: lint → test → build docker → push docker → deploy.
3. Create `.buildkite/scripts/deploy.sh` (executable).
4. Only create or mutate remote CI resources if the user explicitly asked for that step.
5. Validate YAML and Dockerfile.

**Do not stop. Proceed immediately to Phase 21.**

---

## Phase 21 — Infrastructure & Deployment (Infrastructure Engineer)

You are acting as a senior infrastructure engineer.

1. Choose cloud provider (check design doc, then CLI availability, default GCP if `$PROJECT_ID` set).
2. Generate Terraform in `infra/` with modules: compute, database, cache, storage, networking.
3. Create environment tfvars. Update deploy script with Terraform commands.
4. Validate with `terraform fmt` and `terraform validate` if available.

**Do not stop. Proceed immediately to Phase 22.**

---

## Phase 22 — Observability (SRE)

You are acting as a senior site reliability engineer.

1. Create `src/lib/logger.ts` with structured JSON logging (pino).
2. Add request logging middleware and request ID middleware.
3. Create health check endpoints (`/api/health`, `/api/health/ready`).
4. Configure error tracking. Add Terraform monitoring resources (alerts for error rate, latency, health).
5. Write `docs/11-observability.md` with debugging playbook.
6. Run test suite. Confirm 0 failures.

**Do not stop. Proceed immediately to Phase 23.**

---

## Phase 23 — Landing Page (Marketing Engineer)

You are acting as a marketing engineer.

1. Read `docs/01-market-analysis.md` and `docs/03b-ux-design.md`.
2. Create responsive, SEO-optimized landing page (hero, problem, features, social proof, CTA, footer).
3. Add SEO meta tags, OpenGraph, JSON-LD, `robots.txt`, `sitemap.xml`.
4. Verify build succeeds.
5. Ensure the messaging matches the narrow launch wedge from `docs/01b-product-spec.md`; do not market broad capabilities the MVP does not support.

**Do not stop. Proceed immediately to Phase 24.**

---

## Phase 24 — Deployment Safety (Deployment Safety Engineer)

You are acting as a deployment safety engineer.

1. Create `.buildkite/scripts/pre-deploy.sh`, `verify-deploy.sh`, and `rollback.sh`.
2. Update `.buildkite/pipeline.yml` with verify and rollback steps.
3. Write `docs/12-runbook.md` with deployment flow, health checks, rollback procedures, and escalation.

**Do not stop. Proceed immediately to Phase 25.**

---

## Phase 25 — Analytics (Analytics Engineer)

You are acting as a senior analytics engineer.

1. Read `docs/01b-product-spec.md` for KPIs and success metrics.
2. Set up analytics service (PostHog, GA4, or Mixpanel).
3. Define tracking plan: user lifecycle events, core product events, revenue events, engagement events.
4. Create analytics provider component that respects cookie consent from Phase 16.
5. Instrument client-side (page views, form submissions, feature usage) and server-side (API events, payments).
6. Define conversion funnels (signup-to-value, quote-to-completion).
7. Create admin analytics dashboard page with overview metrics, funnels, and time-series charts.
8. Write tests for analytics integration. Run tests and fix until green.
9. Document the north-star event and first-value milestone explicitly.

**Do not stop. Proceed immediately to Phase 26.**

---

## Phase 26 — Production Readiness Review (SRE)

You are acting as a senior SRE conducting a Production Readiness Review.

1. **Backup & DR:** Verify database backups (daily, 30-day retention), file storage versioning, PITR enabled. Add to Terraform if missing. Define RTO/RPO.
2. **SLO/SLI:** Define availability (99.9%), latency (p95 < 500ms), error rate (< 0.1%) targets. Add alert policies.
3. **SSL/TLS:** Verify HTTPS enforced, HSTS header set, certificate auto-renewal.
4. **Secrets:** Audit all secrets are in Secret Manager (not hardcoded). Document rotation plan.
5. **Incident Response:** Add incident response plan to `docs/12-runbook.md` (severity levels, response procedure, escalation).
6. **Capacity:** Verify auto-scaling, resource limits, DB connection pooling.
7. **Checklist:** Run through 40-item production readiness checklist (infrastructure, security, observability, reliability, data, application, legal, CI/CD, operations). Fix all FAIL items.
8. Update `docs/00-checkpoints.md` with the launch recommendation.

---

## Gate D — Launch Readiness Checkpoint

A launch recommendation can be:

- `Go`
- `Conditional Go`
- `No Go`

Only recommend `Go` if:

- the activation path is instrumented
- the product has a coherent wedge
- reliability, security, and rollback basics exist
- there is a plan to learn from real users within 30 days of launch

If the result is `Conditional Go` or `No Go`, list the minimum actions required before launch.

---

## Final Step — Iteration Loop

After launch readiness work, do not blindly keep building features. Start an iteration loop only if there is:

- new user evidence
- analytics data
- competitor movement
- quality regressions
- explicit user direction

The iteration loop must prioritize:

1. activation and retention improvements
2. usability fixes on the core flow
3. competitive parity gaps that block adoption
4. only then adjacent feature expansion
8. Write `docs/15-production-readiness.md` with GO/NO-GO verdict, checklist results, SLO definitions, backup/DR summary, and remaining risks.
9. Commit and push:
   ```
   git add docs/15-production-readiness.md docs/12-runbook.md infra/
   git add -u
   git commit -m "feat: production readiness review — all checks passing"
   git push origin HEAD 2>/dev/null || git push --set-upstream origin HEAD 2>/dev/null || true
   ```

**Do not stop. Proceed immediately to Phase 25.**

---

## PHASE 25 — Iterative Refinement (Product Iteration Engineer)

You are acting as a product iteration engineer running the first refinement cycle.

1. **Market Re-Analysis:** Use web research for new competitors, trends, user feedback. Append "Iteration 1 Update" to `docs/01-market-analysis.md`.
2. **Gap Analysis:** Extract all FR/NFR IDs, scan codebase, classify each as Implemented/Partial/Missing/Divergent. Write `docs/06-gap-analysis.md`.
3. **Plan Updates:** Add new FR/NFR entries (tagged `[Iteration 1]`). Append new tasks to `docs/04-dev-plan.md`.
4. **Implementation:** For each new task, run implement → test → fix loop until tests pass.
5. **Full Verification:** Run ALL tests (unit + integration + smoke + E2E). Run `npm audit` for security. Check build for bundle regressions. Fix any failures.
6. **Iteration Log:** Create `docs/06-iteration-log.md` with findings, gaps addressed, test results.
7. Commit and push:
   ```
   git add .
   git commit -m "feat: iteration 1 — gap analysis, new requirements, and implementation"
   git push origin HEAD 2>/dev/null || git push --set-upstream origin HEAD 2>/dev/null || true
   ```

---

## PHASE 26 — Iteration Loop

Phase 25 can be repeated by invoking `/iterate` independently. Each subsequent run increments the iteration number, appends to the iteration log, and runs the full quality verification suite.

---

## Completion

When all 26 phases are done, print a summary:

```
## Build Complete

### Planning & Design
- docs/01-market-analysis.md     ✅  market analysis complete
- docs/01b-product-spec.md       ✅  product spec with user stories
- docs/02-system-requirements.md ✅  IEEE 830 SRS
- docs/03-system-design.md       ✅  system architecture
- docs/03b-ux-design.md          ✅  UX design system & wireframes

### Implementation
- docs/04-dev-plan.md            ✅  all tasks complete
- Backend (API, auth, logic)     ✅  all backend tests passing
- Frontend (components, pages)   ✅  all frontend tests passing
- Database migrations & seed     ✅  schema current, seed data loaded
- Background jobs & cron         ✅  async processing configured
- Email templates & service      ✅  transactional emails ready
- openapi.yaml                   ✅  API fully documented
- docs/07-api-reference.md       ✅  API reference

### Quality Assurance
- docs/05-code-review.md         ✅  all issues resolved
- docs/09-security-audit.md      ✅  security hardened
- docs/08-e2e-test-report.md     ✅  E2E tests passing
- docs/10-performance-report.md  ✅  performance optimized

### Legal & Compliance
- Privacy policy                 ✅  accessible
- Terms of service               ✅  accessible
- Cookie consent                 ✅  functional
- docs/13-data-retention-policy.md ✅  retention documented

### Infrastructure & Ops
- .env.example + config          ✅  environment management
- docker-compose.yml             ✅  local dev dependencies
- docs/14-environment-guide.md   ✅  environment guide
- Dockerfile + .buildkite/       ✅  CI/CD pipeline active
- infra/                         ✅  Terraform IaC ready
- docs/11-observability.md       ✅  logging, health checks, alerts
- Landing page                   ✅  SEO-optimized marketing page
- docs/12-runbook.md             ✅  deploy verification, rollback, incident response

### Analytics & Readiness
- Analytics instrumentation      ✅  event tracking, funnels, dashboard
- docs/15-production-readiness.md ✅  GO verdict, all checks passing

### Continuous Improvement
- docs/06-gap-analysis.md        ✅  iteration 1 complete
- docs/06-iteration-log.md       ✅  iteration log started
- Test suite: ✅ all passing (unit + integration + smoke + E2E)
```
