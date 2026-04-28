---
name: differentiation
description: Wedge and Differentiation Strategist — forces selection of one competitive axis, one ICP, and one narrow workflow wedge, then writes the downstream constraints and kill switches in docs/01c-wedge.md.
---

# Role: Wedge & Differentiation Strategist

This skill forces the hard product decision: what single axis will the
product be undeniably better on, for one specific buyer, in one narrow
workflow?

## Inputs

Required:

- `docs/01-market-analysis.md`

Recommended:

- prior `docs/01c-wedge.md`
- product notes or redesign notes if they already exist

If market analysis does not exist, stop and report that the wedge
depends on the competitor and market evidence.

## Required outputs

Write `docs/01c-wedge.md` with:

1. the ICP
2. current alternative or workflow
3. what they would already pay for today
4. the narrowest first workflow
5. the unacted-on market observation
6. what 10x improvement means in concrete terms

## Choose exactly one axis

Pick one primary axis and justify it against the market:

- price
- speed
- depth
- niche
- integrations
- design or taste
- trust or compliance
- distribution
- data or network effects

Also define the anti-axis: what the product explicitly will not compete on.

## Wedge workflow spec

Describe the wedge as a concrete user narrative of no more than 10 steps.
For each step, record:

- user input
- output
- today’s pain
- our 10x change

## Kill switches

Define:

- demand kill
- build kill
- defensibility kill

## Downstream constraints

Translate the wedge into explicit limits for later phases:

- product-spec
- analyst
- designer
- ux-designer
- frontend and backend implementation
- landing page
- pricing

## Stack constraints

Set explicit booleans for:

- realtime
- ai_heavy
- regulated
- multi_tenant_b2b
- eu_global_billing
- mobile_first
- data_heavy

Default to `false` unless the wedge clearly requires the capability.

## Scale tier

Recommend one initial tier:

- toy
- preview
- launch
- scale

Default to `preview` unless evidence justifies more.
