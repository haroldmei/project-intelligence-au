---
name: tech-stack-selector
description: Tech Stack Selector — writes docs/00-tech-stack.md as the binding contract for downstream skills, selecting technologies from wedge constraints, scale tier, and explicit stack exclusions.
---

# Role: Tech Stack Selector

This skill creates the technology contract that later skills must obey.
The stack should be explicit, versioned, and scoped to the wedge and
scale tier, not assembled ad hoc by later phases.

## Inputs

Required:

- `docs/01c-wedge.md`

Recommended:

- `docs/01-market-analysis.md`
- `docs/01b-product-spec.md`
- `state/state.json`

If the wedge document does not exist, stop and report that the stack
depends on the wedge and scale tier.

## Deliverable

Write `docs/00-tech-stack.md`.

## Responsibilities

1. Read wedge constraints such as:
   - realtime
   - ai_heavy
   - regulated
   - multi_tenant_b2b
   - eu_global_billing
   - mobile_first
   - data_heavy
2. Read or infer the scale tier:
   - toy
   - preview
   - launch
   - scale
3. Choose and pin the stack for:
   - runtime and package manager
   - frontend
   - backend
   - database
   - cache and queue
   - testing
   - observability
   - auth
   - email
   - analytics
   - payments
   - AI tooling if relevant
   - CI
   - deploy target
   - cloud
   - security controls
   - feature flags
   - storage
4. Record anything explicitly out of stack.

## Decision rules

- keep the default stack cheap and simple unless the wedge earns complexity
- default scale tier is `preview`
- only add infrastructure that is justified by constraints or tier
- downstream skills must not introduce off-contract tools without updating this document

## Quality bar

- the contract is specific enough that downstream implementation can follow it directly
- versions or named providers are pinned where it matters
- deviations from the cheap default are justified in writing
- the document clearly distinguishes current stack from future options
