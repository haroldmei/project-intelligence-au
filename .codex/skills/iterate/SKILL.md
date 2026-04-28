---
name: iterate
description: Iterative Refinement — consumes analytics, support feedback, usability findings, and competitor changes to prioritize the next highest-leverage product improvements and verify them end to end
---

# Role: Product Iteration Engineer

You are running an iterative refinement cycle on an existing product. Your job is to turn real evidence into the next highest-leverage product improvements, then verify those changes with code, tests, and updated launch assumptions. This skill can be invoked multiple times; each run is one evidence-backed iteration.

**Focus area (optional):** the user request

---

## Setup — Determine Iteration Number

1. Check if `docs/06-iteration-log.md` exists.
   - If yes: read it, count existing iterations, this run is N+1.
   - If no: this is iteration 1. Create the file with a header.

---

## Phase 1 — Evidence Intake

1. Read the current:
   - `docs/01-market-analysis.md`
   - `docs/01b-product-spec.md`
   - `docs/00-opportunity-scorecard.md` if present
   - `docs/00-checkpoints.md` if present
2. Collect available evidence from the repo:
   - analytics dashboards or tracking plans
   - support tickets / feedback docs
   - bug reports
   - usability findings
   - E2E / performance / security reports
3. Use web research tools to research:
   - new competitors or product launches since the original analysis
   - updated market trends, pricing changes, regulatory changes
   - user complaints and praise patterns for similar products
   - if a focus area was provided, deep-dive into that aspect
4. Append an **Iteration N Update** section to `docs/01-market-analysis.md`:
   ```markdown
   ## Iteration N Update — [date]
   ### New Findings
   - ...
   ### Product Signals
   - ...
   ### Revised Competitive Position
   - ...
   ### New Opportunities
   - ...
   ### Updated Risks
   - ...
   ```

**Do not stop. Proceed immediately to Phase 2.**

---

## Phase 2 — Gap and Signal Analysis

Perform a systematic comparison between specifications and implementation.

### 2a. Requirements vs Implementation

1. Read `docs/02-system-requirements.md` and extract all FR-xxx and NFR-xxx IDs.
2. Use repo search tools and file reads to scan the actual codebase.
3. For each requirement, determine:
   - **Implemented**: code exists and tests cover it
   - **Partially implemented**: code exists but incomplete or untested
   - **Missing**: no implementation found
   - **Divergent**: implemented differently than specified

### 2b. Design vs Implementation

1. Read `docs/03-system-design.md`.
2. Check for deviations: missing API endpoints, different data models, architectural drift.

### 2c. New Requirements from Evidence and Market Update

1. From Phase 1 findings, derive new functional requirements that should be added.
2. Prioritize them: must-have for competitive parity, should-have for launch quality, or later.

### 2d. Funnel and Experience Review

1. Identify the activation path and first-value milestone.
2. Determine where the highest-friction drop-off appears based on available evidence.
3. Classify findings into:
   - acquisition / positioning
   - onboarding / activation
   - usability / trust
   - missing capability
   - reliability / performance
   - pricing / packaging

### 2e. Write Gap Analysis

Write `docs/06-gap-analysis.md` (create or update):

```markdown
# Gap Analysis — Iteration N

## Date: [date]

## Requirements Coverage Matrix

| Req ID | Description | Status | Notes |
|--------|-------------|--------|-------|
| FR-001 | ... | Implemented / Partial / Missing / Divergent | ... |

## Design Conformance Issues
- ...

## New Requirements Discovered
| New ID | Description | Priority | Source |
|--------|-------------|----------|--------|
| FR-NEW-001 | ... | Must-have / Should-have / Later | Market update / Gap analysis |

## Signal Review
- Activation blockers:
- Repeated user complaints:
- Competitive parity gaps:
- High-leverage experiments:

## Summary
- Total requirements: X
- Implemented: X
- Partial: X
- Missing: X
- New requirements: X
- Priority items for this iteration: X
```

**Do not stop. Proceed immediately to Phase 3.**

---

## Phase 3 — Prioritization and Plan Updates

Based on the gap analysis, update the planning documents:

1. **Update `docs/02-system-requirements.md`**:
   - Add new FR/NFR entries with IDs continuing from the last existing ID
   - Mark them with `[Iteration N]` tag
   - Do not remove or rewrite existing requirements without evidence

2. **Update `docs/03-system-design.md`** only if architecture changes are needed:
   - Add new API endpoints, data model changes, or component updates
   - Mark additions with `[Iteration N]` tag

3. **Update `docs/04-dev-plan.md`**:
   - Append new tasks at the end
   - Each task must include description, acceptance criteria, and test types
   - Mark them with `[Iteration N]` tag

4. Order the work as:
   - activation / retention fixes first
   - severe UX pain second
   - reliability / trust issues third
   - adjacent features fourth

**Do not stop. Proceed immediately to Phase 4.**

---

## Phase 4 — Implementation

For each new or incomplete task from the updated dev plan:

```text
LOOP:
  1. Implement the feature
  2. Write or update tests
  3. Run tests via Bash
  4. If tests fail:
       a. Read the failure output
       b. Identify root cause
       c. Fix the code or test
       d. Go to step 3
  5. If tests pass: mark task complete in docs/04-dev-plan.md
  6. Move to next task
```

Do not move to the next task until the current task's tests pass.

**Do not stop. Proceed immediately to Phase 5.**

---

## Phase 5 — Full Verification

Run all relevant quality checks, not just unit tests.

### 5a. Unit + Integration + Smoke Tests
1. Run the entire test suite.
2. If any test fails: diagnose, fix, and re-run until all green.
3. Run linting if configured.

### 5b. E2E Tests
1. Run Playwright E2E tests if they exist.
2. If any E2E test fails due to new or changed features: update the test or fix the code.
3. If new features were added, add E2E coverage for them.

### 5c. Security Re-Check
1. Run `npm audit` if applicable and fix new Critical / High issues.
2. Scan new and changed files for hardcoded secrets, injection risks, and missing validation.
3. Verify new API endpoints have auth, validation, and sane rate or usage boundaries when relevant.

### 5d. Performance Spot-Check
1. Run a build and check for bundle or build regressions.
2. Scan new database queries for N+1 patterns or missing indexes.
3. Verify list endpoints paginate where appropriate.

### 5e. Feedback Readiness
1. Confirm analytics still capture the activation path after the changes.
2. Confirm new UX surfaces have observable success and failure signals.
3. Update positioning or launch messaging if the product understanding changed materially.

### 5f. Final Confirmation
1. Confirm 0 failures across all test types.
2. Confirm no new Critical / High security issues were introduced.
3. Confirm no major performance regressions.

---

## Phase 6 — Update Iteration Log

Append to `docs/06-iteration-log.md`:

```markdown
## Iteration N — [date]

### Market Findings
- [key new findings]

### Gaps Addressed
- [list of gaps closed with requirement IDs]

### New Features Implemented
- [list of new features with task IDs]

### Product Learning
- [what changed about user understanding, positioning, or funnel assumptions]

### Remaining Gaps
- [list of gaps deferred to next iteration]

### Test Results
- Unit: X passed, 0 failed
- Integration: X passed, 0 failed
- Smoke: X passed, 0 failed
- E2E: X passed, 0 failed
- Security: no new Critical/High issues
- Performance: no regressions

### Files Changed
- [list of key files added/modified]
```

## Git Commit

```bash
git add .
git commit -m "feat: iteration N improvements driven by product evidence"
```

Do not push unless the user explicitly asks.

---

## Completion

Print a summary:

```markdown
## Iteration N Complete

- Market re-analysis:    ✅  [X new findings]
- Gap analysis:          ✅  [X gaps found, Y addressed]
- Plan updates:          ✅  [X new requirements, Y new tasks]
- Implementation:        ✅  [X tasks completed]
- Test suite:            ✅  all passing
- Remaining gaps:        [X items for next iteration]
```
