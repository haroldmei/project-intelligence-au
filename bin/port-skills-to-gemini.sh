#!/usr/bin/env bash
# port-skills-to-gemini.sh — convert .claude/skills/*/SKILL.md to
# .gemini/agents/<name>.md with Gemini-compatible frontmatter and
# tool-name remapping.
#
# Conversions performed:
# - Claude frontmatter (allowed-tools, effort) → Gemini frontmatter
#   (kind, tools, model, max_turns, timeout_mins)
# - Claude tool names (Read, Write, Bash, ...) → Gemini tool names
#   (read_file, write_file, shell, ...)
# - WebSearch/WebFetch → google_search/web_fetch
# - References to nested-subagent patterns (Task tool, Skill tool,
#   "spawn a subagent", etc.) → notes about how the bash orchestrator
#   handles them instead
# - Adds a "## Gemini Port Notes" section at the bottom flagging
#   anything that doesn't translate cleanly

set -euo pipefail
cd "$(dirname "$0")/.."

SRC=".claude/skills"
DST=".gemini/agents"
mkdir -p "$DST"

# Map Claude tool names → Gemini tool names. Wildcard for everything else.
map_tools() {
  local input="$1"
  echo "$input" | tr ',' '\n' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' | while read -r tool; do
    [[ -z "$tool" ]] && continue
    case "$tool" in
      Read)        echo "  - read_file" ;;
      Write)       echo "  - write_file" ;;
      Edit)        echo "  - edit" ;;
      Bash)        echo "  - shell" ;;
      Glob)        echo "  - glob" ;;
      Grep)        echo "  - grep" ;;
      WebSearch)   echo "  - google_search" ;;
      WebFetch)    echo "  - web_fetch" ;;
      Task)        echo "  # NOTE: Task tool — Gemini cannot nest subagents; orchestrator handles delegation" ;;
      Skill)       echo "  # NOTE: Skill tool — not available in Gemini; invoke other agents via shell from bin/" ;;
      *)           echo "  - \"*\"  # unmapped: $tool" ;;
    esac
  done | sort -u
}

# Pick a Gemini model based on Claude effort level
map_model() {
  case "${1:-}" in
    max|high)  echo "gemini-2.5-pro" ;;
    medium)    echo "gemini-2.5-flash" ;;
    low|*)     echo "gemini-2.5-flash" ;;
  esac
}

# Pick max_turns based on effort
map_max_turns() {
  case "${1:-}" in
    max)       echo "60" ;;
    high)      echo "40" ;;
    medium)    echo "30" ;;
    *)         echo "20" ;;
  esac
}

# Pick timeout_mins based on effort
map_timeout() {
  case "${1:-}" in
    max)       echo "30" ;;
    high)      echo "20" ;;
    medium)    echo "15" ;;
    *)         echo "10" ;;
  esac
}

PORTED=0
SKIPPED=0

for skill_dir in "$SRC"/*/; do
  skill_name=$(basename "$skill_dir")
  src_file="$skill_dir/SKILL.md"

  if [[ ! -f "$src_file" ]]; then
    SKIPPED=$(( SKIPPED + 1 ))
    continue
  fi

  # Skip the orchestrator itself — replaced by bin/gemini-build-product-v2
  if [[ "$skill_name" == "build-product-v2" ]]; then
    echo "  skip: $skill_name (replaced by bin/gemini-build-product-v2)"
    SKIPPED=$(( SKIPPED + 1 ))
    continue
  fi

  # Parse the Claude frontmatter
  description=$(awk '/^description:/{sub(/^description:[ \t]*/,""); print; exit}' "$src_file")
  allowed_tools=$(awk '/^allowed-tools:/{sub(/^allowed-tools:[ \t]*/,""); print; exit}' "$src_file")
  effort=$(awk '/^effort:/{sub(/^effort:[ \t]*/,""); print; exit}' "$src_file")
  argument_hint=$(awk '/^argument-hint:/{sub(/^argument-hint:[ \t]*/,""); print; exit}' "$src_file")

  # Body = everything after the closing --- of frontmatter
  body=$(awk 'BEGIN{n=0} /^---$/{n++; next} n>=2{print}' "$src_file")

  # Map tools (or wildcard if no allowed-tools field)
  if [[ -n "$allowed_tools" ]]; then
    tools_block=$(map_tools "$allowed_tools")
  else
    tools_block='  - "*"'
  fi

  model=$(map_model "$effort")
  max_turns=$(map_max_turns "$effort")
  timeout_mins=$(map_timeout "$effort")

  out_file="$DST/${skill_name}.md"

  # Apply body transformations:
  # - Tool name references inside prose: keep capitalized for readability,
  #   but add a one-line note at top of the body
  # - Replace "@$ARGUMENTS" with "{{args}}" (Gemini's command-arg placeholder)
  body_transformed=$(printf '%s' "$body" | sed -E '
    s/\$ARGUMENTS/{{args}}/g
  ')

  cat > "$out_file" <<EOF
---
name: ${skill_name}
description: ${description}
kind: local
model: ${model}
max_turns: ${max_turns}
timeout_mins: ${timeout_mins}
tools:
${tools_block}
---

<!-- Ported from .claude/skills/${skill_name}/SKILL.md -->
<!-- Gemini cannot spawn subagents from agents. If this agent's prose
     references invoking another skill, route through the bash
     orchestrator (bin/gemini-build-product-v2) or the iteration
     scripts (bin/gemini-iterate, bin/gemini-signal-iterate). -->

${body_transformed}

---

## Gemini Port Notes

- **Tool names**: This agent's prose may reference Claude tool names
  (Read, Write, Bash, WebSearch, WebFetch). Gemini equivalents:
  \`read_file\`, \`write_file\`, \`shell\`, \`google_search\`, \`web_fetch\`.
- **No nested subagents**: Where the original prose says "spawn a
  subagent" or "invoke skill X", the bash orchestrator does this
  instead — this agent runs to completion and returns control.
- **No programmatic skill invocation**: There is no \`Skill\` tool in
  Gemini. If you need to call another agent, exit and let the
  orchestrator dispatch the next \`@agent\`.
- **Argument substitution**: \`{{args}}\` is the Gemini equivalent of
  Claude's \`\$ARGUMENTS\`.
EOF

  PORTED=$(( PORTED + 1 ))
  echo "  ported: $skill_name → $out_file"
done

echo
echo "Done: $PORTED ported, $SKIPPED skipped."
echo
echo "Next:"
echo "  1. Review .gemini/agents/<name>.md for any unmapped tools (look for '# unmapped:')"
echo "  2. Run: bin/gemini-build-product-v2 \"<your idea>\""
