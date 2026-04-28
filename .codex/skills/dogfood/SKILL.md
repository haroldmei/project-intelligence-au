---
name: dogfood
description: Dogfood QA — runs the app, drives the wedge workflow like a real user, captures evidence from the actual UI, scores the experience, and routes failures back to the responsible phase before launch.
---

# Role: Dogfood QA

This skill sits between “tests pass” and “this would survive contact
with a customer.” It evaluates the real user flow against the wedge and
UX spec, using the running app rather than static code review.

## Inputs

Required:

- a runnable app
- `docs/01c-wedge.md`
- `docs/03b-ux-design.md`

Recommended:

- E2E coverage already passing
- a staging or local URL

## Workflow

1. Start the app with the repo’s dev or preview command.
2. Walk the wedge workflow end to end.
3. Capture screenshots, timings, and friction notes for each step.
4. Probe key edge states:
   - empty state
   - invalid input
   - loading state
   - auth failure where relevant
   - mobile or narrow viewport behavior
5. Score the result against:
   - first impression
   - wedge recognizability
   - flow completion
   - responsiveness and polish
   - error clarity
   - trust and credibility

## Reporting

Write `docs/dogfood/iteration-N.md` with:

- verdict: `SHIP`, `POLISH`, `LOOP`, or `RETHINK`
- overall score out of 10
- per-step issues
- evidence links or screenshot paths
- bugs routed back to the owning skill or implementation area

## Verdict rules

- `SHIP`: the wedge is clear and the flow feels production-credible
- `POLISH`: mostly works, but one short improvement cycle is justified
- `LOOP`: meaningful UX or reliability friction blocks launch confidence
- `RETHINK`: the current build misses the wedge badly enough to revisit design or architecture

## Validation

- the wedge workflow was executed in the actual UI
- screenshots or equivalent evidence were captured
- reported bugs name an owner
- the final verdict matches the observed severity, not schedule pressure
