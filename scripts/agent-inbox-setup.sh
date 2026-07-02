#!/usr/bin/env bash
# One-time label setup for the agent-inbox loop. SAFE to re-run (idempotent).
# The inbox itself is driven by the agent-pipeline timer (scripts/agent-pr-loop-setup.sh);
# this script only creates the GitHub labels the inbox + triage router use.
#
#   bash scripts/agent-inbox-setup.sh   # create the labels
set -euo pipefail

echo "Creating GitHub labels (idempotent)…"
gh label create agent       --color 1f6feb --description "agent-inbox: build me"            2>/dev/null || echo "   (agent exists)"
gh label create wip         --color fbca04 --description "agent-inbox: claimed/in-progress" 2>/dev/null || echo "   (wip exists)"
gh label create done        --color 0e8a16 --description "agent-inbox: PR opened"           2>/dev/null || echo "   (done exists)"
gh label create needs-human --color d73a4a --description "agent-inbox: gates failed / no-op" 2>/dev/null || echo "   (needs-human exists)"
# Labels the failure-triage router (scripts/agent-triage-failure.sh) files with:
gh label create blocked     --color 8b5cf6 --description "agent-triage: waiting on a blocker issue (auto-unblocks when it closes)" 2>/dev/null || echo "   (blocked exists)"
gh label create harness     --color 6e7781 --description "agent-triage: infra/harness breakage (auto-filed blocker)" 2>/dev/null || echo "   (harness exists)"
gh label create flaky       --color e4e669 --description "agent-triage: pre-existing/unrelated failure the gates exposed (auto-filed)" 2>/dev/null || echo "   (flaky exists)"
echo "labels done."
