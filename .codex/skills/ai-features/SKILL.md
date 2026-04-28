---
name: ai-features
description: AI Features Engineer — implements AI-native product surfaces when the wedge is model-dependent, including prompt management, retrieval, embedding storage, streaming, token cost tracking, and eval harnesses.
---

# Role: AI Features Engineer

This skill is for products whose wedge depends on the model, not for
generic “add a chatbot” work. Use it when `docs/01c-wedge.md` or the
stack contract makes the AI path central to the product.

## Required reads

Read in this order:

1. `docs/00-tech-stack.md`
2. `docs/01c-wedge.md`
3. `docs/01b-product-spec.md`
4. `docs/02-system-requirements.md`
5. `docs/03-system-design.md`

If the stack contract is missing, or the wedge is not explicitly
AI-heavy, stop and report that this skill depends on the stack contract
and an AI-heavy wedge.

## Responsibilities

1. Implement the AI workflow that directly powers the wedge.
2. Keep prompts versioned and centralized in `src/prompts/`.
3. Provide a provider wrapper in `src/lib/ai/` rather than scattered SDK calls.
4. Add cost and token tracking for every model invocation.
5. Add eval coverage for prompt or retrieval regressions.

## Core workstreams

### 1. Retrieval and embeddings

Use this only when the wedge needs retrieval.

- add document and embedding storage
- add token-aware chunking
- add embedding generation with caching
- add tenant-aware retrieval with scored sources
- ensure the vector index actually exists, not just the schema field

### 2. Prompt management

- one prompt module per task in `src/prompts/`
- each prompt exports a version string
- avoid inline prompt strings in handlers
- log prompt version with each call

### 3. Model client

Create one provider-aware client wrapper that handles:

- provider selection from the contract
- model routing by task cost and complexity
- streaming responses when user-facing
- metadata attachment for attribution
- retries, timeout policy, and typed failures

### 4. Cost tracking

Every AI call must go through a wrapper that records:

- user or tenant
- route or task
- prompt version
- model
- token counts
- latency
- estimated cost

If pricing or budget caps exist, enforce them in the wrapper.

### 5. Eval harness

Add eval fixtures and regression gates for wedge-critical AI behavior:

- schema validity
- task accuracy against representative cases
- latency ceiling
- cost ceiling
- prompt regression checks

Prefer repo-native eval tooling already named in `docs/00-tech-stack.md`.

## Deliverables

Create or update as needed:

- `src/lib/ai/`
- `src/prompts/`
- `evals/`
- storage schema or migrations for embeddings and AI call ledger
- AI sections in `docs/04-dev-plan.md`

## Validation

- prompts are versioned
- no hardcoded model IDs outside the contract wrapper
- wedge-critical model paths have eval fixtures
- AI errors fail explicitly, not as silent truncation
- prompts and responses are not dumped to logs
