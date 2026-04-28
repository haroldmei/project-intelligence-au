# Gemini CLI — Team User Manual

## 1. Introduction
This manual defines how to use Gemini CLI to drive the `build-product` pipeline and perform general software engineering tasks in this repository.

## 2. Core Concepts

### Subagents (@name)
Subagents are isolated experts. Use them for focused tasks:
- `@backend-developer`: API, DB, business logic.
- `@frontend-developer`: UI, components, state.
- `@security-auditor`: OWASP checks, secret scanning.
- `@codebase_investigator`: Deep search and architectural mapping.

### Plan Mode (/plan)
**Never start a multi-file change without Plan Mode.**
1. Type `/plan` or the `enter_plan_mode` tool.
2. Let the agent research and propose a Markdown plan.
3. Approve the plan to begin execution.

### Project Memory (GEMINI.md)
The `GEMINI.md` file in the root is the **Law of the Project**. It contains coding standards, architectural decisions, and pipeline rules. The agent reads this every time it starts.

---

## 3. The Build Pipeline

To build a new feature or product from scratch:
```bash
/build-product-v2 "Your idea here"
```

### 3.1 Pipeline Architecture

```mermaid
graph TD
    User([User Idea]) --> Cmd[/build-product-v2]
    Cmd --> Bash{Bash Orchestrator}

    subgraph Phase1_Strategy [1. Strategy & Market]
        Bash --> CEO[@ceo]
        CEO --> CEO_C{Critic}
        CEO_C -- Fail --> CEO
        CEO_C -- Pass --> DIFF[@differentiation]
        DIFF --> DIFF_C{Critic}
        DIFF_C -- Fail --> DIFF
    end

    DIFF_C -- Pass --> CP1{{"Human Checkpoint 1:<br/>Wedge & Scale Tier"}}

    subgraph Phase2_Contract [2. The Contract]
        CP1 --> STACK[@tech-stack-selector]
        STACK --> STACK_C{Critic}
    end

    subgraph Phase3_Design [3. Design & Specs]
        STACK_C -- Pass --> SPEC[@product-spec]
        SPEC --> ANALYST[@analyst]
        ANALYST --> DESIGN[@designer]
        DESIGN --> UX[@ux-designer]
    end

    UX --> CP2{{"Human Checkpoint 2:<br/>Visual Target"}}

    subgraph Phase4_Implementation [4. Implementation Fan-out]
        CP2 --> AUTH[@auth-engineer]
        AUTH --> AI[@ai-features]
        AI --> BE[@backend-developer]
        BE --> FE[@frontend-developer]
        FE --> DB[@db-migrator]
    end

    subgraph Phase5_Validation [5. Quality & Security]
        DB --> QG["scripts/quality-gates.sh"]
        QG -- Fail --> BE
        QG -- Pass --> ADV[@adversarial-tester]
        ADV --> SEC[@security-auditor]
        SEC --> DOG[@dogfood]
    end

    DOG --> CP3{{"Human Checkpoint 3:<br/>Pricing & Positioning"}}

    subgraph Phase6_Ship [6. Launch]
        CP3 --> LAND[@landing-page]
        LAND --> LEGAL[@legal-compliance]
        LEGAL --> OPS[@deployer]
    end

    OPS --> CP4{{"Human Checkpoint 4:<br/>GO/NO-GO"}}
    CP4 --> SHIP([LIVE PRODUCT])
```

### 3.2 Key Components

- **The Orchestrator (`bin/gemini-build-product-v2`):** The "State Machine." It manages state persistence (`state/state.json`), headless invocation via `--yolo`, and automatic critic gates.
- **Specialized Agents:**
    - **Strategy:** `@ceo` and `@differentiation` handle market fit.
    - **Builder:** `@backend-developer` and `@frontend-developer` handle implementation.
    - **Safety:** `@security-auditor` and `@adversarial-tester` perform audits and stress tests.

### 3.3 Scale Tiers
You will be asked to pick a tier at Checkpoint 1:
| Tier | Destination | Ops Level |
|---|---|---|
| `toy` | Local only | None (skips ops) |
| `preview` | Vercel/Fly | Minimal (default) |
| `launch` | Cloud Run | Production-grade (Terraform) |
| `scale` | Multi-region | Enterprise (High Availability) |

---

## 4. Daily Commands

### Testing & Quality
```bash
# Run all gates (lint, typecheck, tests)
./scripts/quality-gates.sh

# Fix all lint/type errors automatically
@backend-developer "Run quality-gates.sh and fix all errors"
```

### Context & Memory
- `/memory show`: See what the agent currently knows.
- `/memory reload`: Refresh context after manual file edits.
- `! <command>`: Run any shell command (requires confirmation).

---

## 5. Workflow Best Practices

1. **The "Contract" First:** If you want to change the database or UI library, do NOT edit the code. Edit `docs/00-tech-stack.md` and the agents will automatically refactor the code to match the new contract.
2. **Reviewing Critic Failures:** If a critic fails, check `state/run-critic-[phase].log`. It contains the exact reason why the AI rejected its own work.
3. **Manual Intervention:** If you need to manually fix something, run `/memory reload` afterwards so the orchestrator knows about your changes.
4. **Surgical Edits:** Use the `replace` tool rather than `write_file` for large existing files to minimize token usage.
5. **YOLO Mode:** Be careful with `--yolo`. Only use it for trusted automated scripts like the orchestrator.
6. **Commit Style:** Always ask the agent to "Commit the change with a descriptive message" after a task is verified.
7. **Resyncing:** The Claude skills are the source of truth. If you edit `.claude/skills/`, run `bin/port-skills-to-gemini.sh`.

---
*Manual Version: 2026.1 — Updated: 2026-04-28*
