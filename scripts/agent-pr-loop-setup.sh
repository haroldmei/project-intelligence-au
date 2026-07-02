#!/usr/bin/env bash
# One-time activation for the SEQUENTIAL agent pipeline (docs/AGENT-HARNESS.md). SAFE to
# re-run (idempotent). Creates the GitHub labels + installs/starts the SINGLE
# pi-agent-pipeline timer that drives ONE issue end-to-end: build → PR → review⇄fix →
# merge → close, then the next issue. The merger (run inside the pipeline) is
# ProjectIntelligence's local CI/CD gate: it re-runs the gates on the integrated PR and
# fast-forwards the base branch (develop) only on green. Deploys stay Vercel's job.
# This is the only step with real side-effects, so it is NOT run by any test suite.
#
#   bash scripts/agent-pr-loop-setup.sh                # labels + install + start the pipeline timer
#   bash scripts/agent-pr-loop-setup.sh --labels-only  # just the labels
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "1) Creating GitHub labels (idempotent)…"
bash "$ROOT/scripts/agent-inbox-setup.sh"
gh label create review-needed      --color 0e8a16 --description "pr-loop: ready for (re-)review"                 2>/dev/null || echo "   (review-needed exists)"
gh label create review-wip         --color fbca04 --description "pr-loop: reviewer working (claim)"              2>/dev/null || echo "   (review-wip exists)"
gh label create changes-requested  --color d93f0b --description "pr-loop: reviewer requested changes"            2>/dev/null || echo "   (changes-requested exists)"
gh label create fix-wip            --color fbca04 --description "pr-loop: fixer working (claim)"                 2>/dev/null || echo "   (fix-wip exists)"
gh label create review-approved    --color 1a7f37 --description "pr-loop: passed review — ready to land (NOT merged)" 2>/dev/null || echo "   (review-approved exists)"
gh label create review-stuck       --color b60205 --description "pr-loop: max rounds / unfixable — needs a human" 2>/dev/null || echo "   (review-stuck exists)"
gh label create merge-wip          --color fbca04 --description "pr-loop: merger integrating (claim)"             2>/dev/null || echo "   (merge-wip exists)"
gh label create merged             --color 0e8a16 --description "pr-loop: integrated + auto-merged into the base branch" 2>/dev/null || echo "   (merged exists)"
gh label create merge-stuck        --color b60205 --description "pr-loop: integration conflict / gates red — needs a human" 2>/dev/null || echo "   (merge-stuck exists)"

if [ "${1:-}" = "--labels-only" ]; then echo "labels done."; exit 0; fi

echo "2) Installing the pi-agent-pipeline systemd unit…"
mkdir -p "$HOME/.config/systemd/user"
cp "$ROOT"/deploy/systemd/pi-agent-pipeline.service \
   "$ROOT"/deploy/systemd/pi-agent-pipeline.timer \
   "$HOME/.config/systemd/user/"
systemctl --user daemon-reload

echo "3) Enabling + starting the single pipeline timer…"
systemctl --user enable --now pi-agent-pipeline.timer

echo "4) Enabling linger (so the timer runs even when you're logged out)…"
loginctl enable-linger "$USER" 2>/dev/null || echo "   (could not enable linger — run: sudo loginctl enable-linger $USER)"

cat <<'EOF'

✅ Sequential agent pipeline is live (one issue end-to-end, then the next).
   Status:   systemctl --user list-timers 'pi-agent-*'
   Logs:     journalctl --user -u pi-agent-pipeline.service -f   (and /tmp/pi-agent-pipeline/)

Per run (scripts/agent-pipeline.sh):
  • if a PR is in flight → drive IT (don't start a new issue);
  • else agent-inbox builds the next `agent` issue → PR `review-needed`;
  • reviewer (opus) → approve (`review-approved`) | request changes (`changes-requested`);
  • fixer (sonnet ≠ reviewer) addresses + re-gates → `review-needed` … until approved or PR_MAX_ROUNDS → `review-stuck`;
  • merger (opus) integrates `review-approved`, re-runs the gates, fast-forwards `develop` on green (`merged`) — else `merge-stuck`;
  • the pipeline then CLOSES the issue (the merger doesn't; there's no Closes-keyword).
CI/CD: the merger's gates ARE the CI gate. Deploys stay Vercel's push-triggered builds.
EOF
