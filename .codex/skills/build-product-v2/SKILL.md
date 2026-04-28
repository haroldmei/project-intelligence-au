---
name: build-product-v2
description: Gated autonomous product builder — orchestrates a state-machine product pipeline with wedge selection, critic gates, scale-tier branching, and evidence-driven iteration rather than a single-pass waterfall.
---

# Autonomous Product Builder v2

This is the stricter orchestrator. It treats product building as a
state machine with gates, not a one-shot sequence of artifact creation.

## Operating model

1. The wedge is the control surface. Once locked, downstream phases must stay in wedge.
2. Every major artifact gets a critic gate before the next phase proceeds.
3. Scale tier determines whether later ops, resilience, and launch phases are required.
4. Failures route backward to the owning phase instead of being hand-waved forward.
5. State lives in `state/state.json` and is updated as decisions are made.

## Required artifacts

Maintain or create:

- `state/state.json`
- `docs/00-opportunity-scorecard.md`
- `docs/00-checkpoints.md`
- `docs/01-market-analysis.md`
- `docs/01b-product-spec.md`
- `docs/01c-wedge.md`
- `docs/02-system-requirements.md`
- `docs/03-system-design.md`
- `docs/03b-ux-design.md`
- `docs/04-dev-plan.md`

## Phase order

1. Market analysis
2. Wedge and differentiation
3. Tech stack contract
4. Product spec
5. Requirements
6. System design
7. UX design
8. Auth and supporting foundations as needed
9. Implementation
10. API docs, E2E, and quality gates
11. Adversarial and security review
12. Dogfood
13. Pricing, positioning, and launch prep
14. Signal-driven iteration after usage data exists

## Required critic gates

Run a critic pass after:

- market analysis
- wedge selection
- product spec
- system design
- UX design
- pricing
- positioning
- implementation quality gates
- dogfood

Each gate records:

- artifact reviewed
- pass, fail, or conditional pass
- blocking issues
- evidence gaps
- next owner

## Scale-tier branching

- `toy`: skip most ops and launch overhead
- `preview`: focus on wedge, UX, instrumentation, and learning loops
- `launch`: add production readiness, observability, billing, deployment safety
- `scale`: add resilience, operational controls, and stricter rollout gates

## Failure routing

If a gate fails, route back to the owner phase:

- weak market thesis -> market analysis or wedge
- bloated scope -> wedge or product spec
- architecture mismatch -> system design
- poor usability -> UX design or dogfood fixes
- failing quality gates -> developer, frontend, backend, or E2E owner

## Output expectations

Update `state/state.json` and `docs/00-checkpoints.md` as the source of
truth for:

- current phase
- phase status
- critic verdicts
- scale tier
- wedge sentence
- open issues
- key decisions

Do not treat this skill as permission to skip implementation quality or
market evidence. The point is tighter control, not more artifact volume.
