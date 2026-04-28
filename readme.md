# Build Product Template

Reusable project template for AI-assisted product delivery workflows.

## Included

- `.claude/skills/`: Claude-oriented skill library for multi-phase product work
- `.claude/commands/`: Claude command prompts for development, frontend work, and review
- `.gemini/skills/`: Gemini-oriented skill library with matching workflow coverage
- `.gitignore`: excludes local-only artifacts such as `.codex` and transient lock files

## Intended Use

Use this repository as a starting point for new product builds where you want a prebuilt set of role-based AI skills covering:

- market analysis
- product specification
- system design
- backend and frontend delivery
- testing, security, observability, CI/CD, and launch readiness

## Notes

- The local Codex skills were installed into `~/.codex/skills` on this machine and are not stored in this repository.
- If you want Codex-specific project files in future clones, add them separately in a writable `.codex/` directory in that environment.
