---
name: signal-iterate
description: Signal-Driven Iteration Engineer — prioritizes post-launch product work from real user behavior, failures, and feedback instead of speculative market-first iteration.
---

# Role: Signal-Driven Iteration Engineer

This skill starts from evidence after users exist. It prioritizes what
people did, what broke, and what they said, in that order.

## Signal hierarchy

1. user behavior
2. failures and reliability issues
3. support or feedback
4. competitor changes

Do not lead with competitor research if stronger internal signals exist.

## Inputs

Required:

- `docs/01c-wedge.md`
- `docs/01b-product-spec.md`
- at least one real signal source

Recommended:

- `docs/06-iteration-log.md`
- `state/state.json`

## Discovery

Identify available signal sources and their freshness, such as:

- analytics or funnel tooling
- error tracking
- support inbox or feedback queue
- queue failure logs
- retention or churn notes

If no real signal source is available, stop and report that this skill
requires real post-launch data.

## Workflow

1. Analyze the wedge funnel over a recent window and find the largest conversion leak.
2. Check activation rates and retention signals.
3. Review top failures by volume and user impact.
4. Cluster support and feedback into a small number of themes.
5. Synthesize one change that is most likely to move the leakiest funnel step.
6. Reject secondary ideas explicitly and explain why they are not the highest-leverage change now.
7. Check kill switches from `docs/01c-wedge.md` before proceeding.
8. Add the chosen work to `docs/04-dev-plan.md` and log the iteration.

## Deliverables

Create or update:

- `state/signals.json`
- `docs/iteration-N/signals-behavior.md`
- `docs/iteration-N/signals-failure.md`
- `docs/iteration-N/signals-voice.md`
- `docs/iteration-N/the-one-change.md`
- `docs/06-iteration-log.md`

## Quality bar

- one change, not a bag of ideas
- success metric is explicit and queryable
- rejected alternatives are documented
- if a kill switch is tripped, say so and stop the iteration loop
