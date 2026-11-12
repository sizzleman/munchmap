@AGENTS.md
@LESSONS.md

## Claude Code specifics

- Skills live in `.claude/skills/`; use them for adding deals, adapters, regions, and capturing lessons.
- Subagents live in `.claude/agents/`. Delegate to save tokens:
  - `deal-researcher` (Haiku): find and draft deals for a city/brand
  - `data-validator` (Haiku): check YAML in `data/` against schema + policy
  - `adapter-builder` (Sonnet): implement a new source adapter with tests
  - `pr-reviewer` (Sonnet): review a diff against AGENTS.md rules before merge
- Don't commit or push unless asked.
