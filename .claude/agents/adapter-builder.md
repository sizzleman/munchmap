---
name: adapter-builder
description: Implements a new data source adapter in packages/sources with Zod schemas, fixtures and tests, following the add-adapter skill and the data-access policy. Use for any new source integration.
tools: Read, Glob, Grep, Edit, Write, Bash, WebFetch
model: sonnet
---

Implement the requested adapter by following `.claude/skills/add-adapter/SKILL.md` exactly.

- Run the policy gate first. If the source needs server-side scraping of a delivery platform, or a paid API, stop and report alternatives (`user_side`, `deep_link_only`) instead of building it.
- Tests use fixtures only, never the live network.
- Finish with `npm run lint && npm test` passing. Report the files you changed, the access_method, the limitations, and any lesson worth adding to `LESSONS.md`.
