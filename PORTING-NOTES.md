# Porting Notes — Claude Code → Gemini CLI

**Purpose:** This project ships dual targets. The same product-builder
pipeline runs on Claude Code (via `.claude/skills/`) and on Gemini CLI
(via `.gemini/agents/` + `.gemini/commands/` + `bin/`). This file
documents what was ported, what was rewritten, and what could not be
translated.

**Date:** 2026-04-28
**Source:** `.claude/skills/` (35 active skills, v2 orchestrator)
**Target:** Gemini CLI v0.36+ (agents + commands + extensions)

---

## TL;DR

- **34 agents ported** from `.claude/skills/` to `.gemini/agents/`
- **3 slash commands** in `.gemini/commands/` (build-product-v2, iterate, signal-iterate)
- **3 bash drivers** in `bin/` that replace Claude's self-orchestration
- **1 generic critic agent** with phase-name dispatch (replaces 8 individual critics)
- **Project memory** in `GEMINI.md` (mirrors `CLAUDE.md`)
- **Settings** in `.gemini/settings.json` (mirrors `.claude/settings.json`)

The Gemini port is functionally equivalent to the Claude pipeline for
all phase logic and quality gates. **The two architectural compromises**
are documented below: orchestration moves to bash, and scheduling moves
to OS cron.

---

## Side-by-side feature mapping

| Claude feature | Gemini equivalent | Notes |
|---|---|---|
| `.claude/skills/<name>/SKILL.md` | `.gemini/agents/<name>.md` | Agent file format. Frontmatter swapped, body preserved. |
| `name`, `description` frontmatter | Same | 1:1 |
| `allowed-tools: Read, Write, Bash` | `tools: [read_file, write_file, shell]` | Tool names mapped (see table below) |
| `effort: max\|high\|medium\|low` | `model` + `max_turns` + `timeout_mins` | Higher effort → gemini-2.5-pro + more turns + longer timeout |
| `argument-hint: "<x>"` | (free text in `description`) | Gemini agents don't have a separate argument-hint field |
| `$ARGUMENTS` placeholder | `{{args}}` | Substituted in body during port |
| Slash command `/<skill>` | `/<command>` (TOML) or `@<agent>` | Top-level entry points use commands; phases run as `@agents` |
| `Skill` tool (programmatic invocation) | **Not available** | Bash orchestrator dispatches the next agent |
| `Task` / Agent tool (nested subagents) | **Forbidden** | Bash orchestrator owns the state machine |
| `ScheduleWakeup`, `CronCreate` | OS `cron` + `bin/gemini-signal-iterate` | Manual setup; documented in commands and PORTING-NOTES |
| `run_in_background`, `Monitor` | `nohup` or `tmux` | Foreground REPL only |
| `ToolSearch` (deferred tool loading) | Eager registration | At ≥50 MCP tools, prompt bloats. [Open issue](https://github.com/googleapis/python-genai/issues/2185). |
| `PushNotification`, `RemoteTrigger` | `Notification` hook (one-way) | No inbound webhook entry |
| `EnterWorktree` / Agent worktree isolation | `--worktree` / `-w` flag | 1:1 since v0.36+ |
| `CLAUDE.md` hierarchy (user + project + nested) | `GEMINI.md` hierarchy (same) | 1:1; Gemini loads subdirs JIT (advantage) |
| `.claude/settings.json` | `.gemini/settings.json` | Layered same way |
| MCP servers (global) | MCP in `settings.json` | 1:1 |
| MCP servers (per-agent) | Per-agent `mcpServers` in frontmatter | **Gemini advantage** |
| Hooks: PreToolUse, PostToolUse | BeforeTool, AfterTool | 1:1 |
| Hooks: UserPromptSubmit | BeforeAgent | 1:1 |
| Hooks: model-lifecycle | BeforeModel, AfterModel | **Gemini advantage** |
| Plugin marketplace | Extensions marketplace | Both have one; Gemini's gallery is younger |

---

## Tool name mapping (used by `bin/port-skills-to-gemini.sh`)

| Claude name | Gemini name | Notes |
|---|---|---|
| `Read` | `read_file` | |
| `Write` | `write_file` | |
| `Edit` | `edit` | |
| `Bash` | `shell` | |
| `Glob` | `glob` | |
| `Grep` | `grep` | |
| `WebSearch` | `google_search` | |
| `WebFetch` | `web_fetch` | |
| `Task` | (none) | Agent emits a note; orchestrator handles delegation |
| `Skill` | (none) | Same |
| `ScheduleWakeup` | (none) | Same |

Anything not in this table maps to `"*"` with an `unmapped:` comment
for manual review. (After the port, no agents had unmapped tools.)

---

## What gets compromised in the Gemini port

### 1. Orchestration in bash, not in an agent

Claude's `build-product-v2` is itself an agent that spawns sub-agents
per phase, runs critic gates, branches on scale tier, loops on failure,
etc. Gemini agents **cannot spawn other agents**, so the orchestrator
moves to `bin/gemini-build-product-v2`.

**Tradeoffs:**
- Bash orchestration is less expressive than agent orchestration.
- The orchestrator can't reason adaptively about phase failures — it
  applies the routing matrix mechanically.
- Human checkpoints work fine (the script `read -p`s).
- State management (`state/state.json` + ADR log) is unchanged.

### 2. Sequential implementation fan-out

Claude's Phase 7 fans out backend + frontend + db-migrator in parallel
via three `Task` calls in one message. Gemini does not document
guaranteed parallel subagent execution, so the bash orchestrator runs
them **sequentially**. Wall-clock time roughly triples for that phase.

If Gemini adds reliable parallel agent dispatch, change three lines in
`bin/gemini-build-product-v2` (Phase 7 block) to background-and-wait:

```bash
gemini -p "@backend-developer ..." --yolo &
gemini -p "@frontend-developer ..." --yolo &
gemini -p "@db-migrator ..." --yolo &
wait
```

### 3. Scheduling via OS cron

`signal-iterate` should run weekly post-launch. Claude Code has
`ScheduleWakeup` and `CronCreate`. Gemini has no scheduling primitive.

**Workaround** (added to crontab manually):

```cron
0 9 * * MON cd /path/to/project && bin/gemini-signal-iterate >> state/signal-iterate.log 2>&1
```

The `/signal-iterate` command in `.gemini/commands/signal-iterate.toml`
documents this.

### 4. Background agents via `nohup` or `tmux`

Claude's `run_in_background` + `Monitor` for live-streaming long jobs
have no Gemini analog. For a multi-hour build, run the orchestrator
under `nohup`:

```bash
nohup bin/gemini-build-product-v2 "<idea>" > state/build.log 2>&1 &
tail -f state/build.log
```

### 5. No programmatic skill invocation

Claude agents can call `Skill(skill="<name>", args="...")` mid-plan to
delegate within an agent context. Gemini agents must exit and let the
orchestrator dispatch the next `@agent`. Workaround: agents emit a
structured marker (e.g. `NEED_AGENT: <name>`) and the orchestrator
routes accordingly. The current port doesn't use this — it's a future
optimization if needed.

### 6. No deferred tool loading

Claude's `ToolSearch` lazily fetches tool schemas. With 50+ MCP tools,
Gemini's eager registration bloats every prompt. **Mitigation**: keep
`mcpServers` minimal at the project level, and use per-agent inline
`mcpServers` (a Gemini advantage) so each agent only sees the tools
it actually needs.

---

## Where Gemini is genuinely better than Claude (for this use case)

1. **Per-agent inline MCP servers**: cleaner isolation than Claude's
   global config. Use it.
2. **Model-lifecycle hooks** (`BeforeModel`, `AfterModel`): finer
   interception than Claude's hook set. Useful for cost telemetry.
3. **JIT subdirectory context**: subdirectory `GEMINI.md` only enters
   context when tools touch that path. Better for monorepos.
4. **Enterprise policy engine**: central org-level disable of YOLO
   etc. Configure in `.gemini/settings.json` `policy` block.
5. **Single-flag `--worktree`**: comparable to Claude's worktree
   support but cleaner UX.

---

## File layout after porting

```
.claude/                          # Original Claude implementation
  skills/
    <34 skill dirs>/SKILL.md
  settings.local.json
CLAUDE.md                         # Project memory for Claude

.gemini/                          # Gemini port (this work)
  agents/
    <34 agent files>.md           # Ported from .claude/skills/
    critic.md                     # New: generic critic with phase dispatch
  commands/
    build-product-v2.toml         # Top-level entry point
    iterate.toml
    signal-iterate.toml
  settings.json                   # Hooks, MCP, policy
GEMINI.md                         # Project memory for Gemini

bin/
  gemini-build-product-v2         # The bash orchestrator (replaces v2 self-orchestration)
  gemini-iterate                  # Wrapper for @iterate
  gemini-signal-iterate           # Wrapper for @signal-iterate (cron-pair)
  port-skills-to-gemini.sh        # The conversion script (rerun if .claude/skills/ changes)

scripts/                          # Shared between both ports
  state-init.sh
  state-set.sh
  state-decide.sh
  quality-gates.sh
  route-failure.sh

docs/                             # Pipeline outputs (shared)
  00-tech-stack.md                # Binding contract (read by both ports)
  01-market-analysis.md
  01b-product-spec.md
  01c-wedge.md
  ...
  USER-MANUAL.md                  # Workflow manual (Claude side)
PORTING-NOTES.md                  # This file
```

---

## How to keep the two ports in sync

The Claude side is the source of truth for skill bodies. To resync
after editing `.claude/skills/`:

```bash
bin/port-skills-to-gemini.sh
git diff .gemini/agents/         # Review, then commit
```

The conversion is deterministic: same `SKILL.md` produces the same
`.gemini/agents/<name>.md`. Manual edits in `.gemini/agents/` will be
overwritten on rerun unless you migrate the change back to
`.claude/skills/`.

The critic agent (`.gemini/agents/critic.md`) and bash orchestrators
in `bin/` are **hand-written and Gemini-specific** — they are not
regenerated by the port script.

---

## How to run the Gemini port

### Build a new product

```bash
gemini  # interactive; then type:
/build-product-v2 "AI-powered invoice reconciliation for solo bookkeepers"

# or headless:
bin/gemini-build-product-v2 "AI-powered invoice reconciliation for solo bookkeepers"
```

### Iterate post-launch

```bash
# Manual run:
/signal-iterate                  # interactive
bin/gemini-signal-iterate        # headless

# Weekly cadence (add to crontab):
0 9 * * MON cd /path/to/project && bin/gemini-signal-iterate
```

### Single-phase reruns

```bash
gemini -p "@ceo Refresh market analysis"
gemini -p "@tech-stack-selector"
gemini -p "@dogfood"
```

---

## Open questions / future work

1. **Parallel fan-out**: revisit when Gemini documents reliable
   parallel subagent dispatch. Currently sequential.
2. **`.gemini/skills/` cleanup**: there's a stale half-port from
   pre-v2 in this directory. Recommend deleting once the new port is
   verified end-to-end. Left in place to avoid surprising the user.
3. **MCP server selection per scale tier**: Claude doesn't do this
   either, but Gemini's per-agent inline MCP makes it cheap. E.g.
   `@backend-developer` gets stripe-mcp only at `launch+` tier.
4. **Critic checklist DRY**: the critic checklists currently live in
   `.gemini/agents/critic.md` and (separately) in
   `.claude/skills/build-product-v2/SKILL.md`. Future: extract to a
   shared `docs/critic-checklists.yml` that both sides import.

---

*End of porting notes.*
