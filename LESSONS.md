# LESSONS.md

A shared, append-only memory for humans and AI agents working on this repo.
**Read this before starting work. Add to it when you learn something non-obvious.**

## How to add a lesson

Append at the **top** of the Log, using this format (keep it to ~5 lines):

```
### YYYY-MM-DD · <area> · <short title>
- **What happened:** the mistake, surprise, or correction
- **Lesson:** the rule to follow next time
- **Source:** human | agent:<tool/model> | PR #<n>
- **Status:** active | promoted (→ AGENTS.md) | obsolete
```

Areas: `data`, `sources`, `core`, `mcp`, `web`, `bots`, `ci`, `oss`, `region:<CC>`, `agents`.

Rules:

- Write lessons as rules others can act on, not diary entries.
- Don't delete lessons. Mark them `obsolete` and explain why.
- If a lesson has come up twice, promote it into `AGENTS.md` and mark it `promoted`.

---

## Log

### 2026-11-12 · sources · Public Overpass servers are flaky
- **What happened:** In browser testing, overpass-api.de returned 502s and then hung, and one mirror accepted the connection but never replied, so the Nearby tab spun forever.
- **Lesson:** Every external fetch needs a timeout (`AbortSignal.timeout`) and a fallback. `findRestaurants` tries several public instances with a 12s timeout each. Never assume a free public API is up; show a clear error and let the user retry.
- **Source:** agent:claude-code (browser test)
- **Status:** active

### 2026-11-12 · web · Remembered UI state can be invalid in a new context
- **What happened:** The compare rows saved "ubereats" in localStorage, then the user switched to Dubai (no Uber Eats). The dropdown silently showed "Pickup" while the state still said Uber Eats.
- **Lesson:** When restoring saved state, re-check it against the current region and data, and snap invalid values to a valid default.
- **Source:** agent:claude-code (browser test)
- **Status:** active

### 2026-11-12 · core · Keep core browser-safe
- **What happened:** The web app and Cloudflare Worker couldn't import `@munchmap/core` while it re-exported a `node:fs` loader.
- **Lesson:** Filesystem code lives only in `load.ts` and is exported via `@munchmap/core/node`. Check with `esbuild apps/worker/src/index.ts --bundle --platform=browser`. Browsers also can't set `User-Agent` without triggering a CORS preflight, so only send it from servers.
- **Source:** agent:claude-code
- **Status:** promoted (→ AGENTS.md rule 3)

### 2026-11-12 · oss · AGPL blocks closed forks, not selling
- **What happened:** The maintainer wanted "no paid copies, no closed forks, modified hosted copies must publish changes."
- **Lesson:** AGPL covers the last two. No OSI license can ban selling, but AGPL makes paid clones pointless because buyers get the source. The project name needs trademark protection, which is separate from the license. See docs/LICENSING.md.
- **Source:** human + agent:claude-code
- **Status:** active

### 2026-11-12 · data · Research agents copied an email tracking URL as a source
- **What happened:** A platform file's `source_url` had Salesforce Marketing Cloud `sfmc_*` params (journey IDs) because the agent found the page through an email CDN link.
- **Lesson:** Source links must be clean public URLs. `validate:data` now rejects URLs that `cleanUrl` would change, and `sfmc_` is on the tracking-param list. Add any new tracking params you find to `privacy.ts`.
- **Source:** agent:claude-code (review of deal-researcher output)
- **Status:** promoted (→ AGENTS.md rule 9)

### 2026-11-12 · data · `verified_at` means "source date confirmed", not "date I fetched it"
- **What happened:** The Grubhub+ price came from a 2022 announcement but had `verified_at: 2026-11-12`, so it looked fresh.
- **Lesson:** If the newest source is old, set `verified_at` to the source's date so the stale-data warning fires. If days, prices or thresholds aren't stated, use null. Don't fill in assumptions (e.g. "all 7 days").
- **Source:** agent:claude-code
- **Status:** active

### 2026-11-12 · agents · Haiku researchers yield few verified local deals
- **What happened:** 5 parallel deal-researcher runs gave 20 deals across 9 areas (CMC: 0). Many official sites returned 403 or need JavaScript, and most local specials only appear on Instagram or aggregators.
- **Lesson:** Use agents for chains, national programs and campus-run pages. Local spots need campus captains (humans) or the screenshot/inbox flows. Research agents must write one national file for chain-wide programs, not one copy per city.
- **Source:** agent:claude-code
- **Status:** active

### 2026-11-12 · ci · Biome reformats Markdown and breaks frontmatter
- **What happened:** `biome check --write .` added a blank line inside SKILL.md and agent frontmatter.
- **Lesson:** Markdown is excluded in `biome.json` (`!**/*.md`). Keep it that way.
- **Source:** agent:claude-code
- **Status:** active

### 2026-11-12 · data · YAML `ON` and other 1.1 booleans
- **What happened:** Ontario's region code `ON` is a boolean in YAML 1.1 parsers.
- **Lesson:** Our parser (`yaml`, YAML 1.2) treats it as a string, but quote `"ON"` in region files anyway in case other tools read the data.
- **Source:** agent:claude-code
- **Status:** active

### 2026-11-11 · sources · Delivery platforms have no public consumer APIs

- **What happened:** The original idea assumed we could pull live prices from DoorDash/Uber Eats/Skip/Talabat/TGTG.
- **Lesson:** They don't offer public APIs, and their ToS ban scraping. Use open data (OSM), the community registry, the platform-fee knowledge base, user-side capture, and deep links. Never build server-side scrapers in this repo.
- **Source:** human + agent:claude-code (planning)
- **Status:** promoted (→ AGENTS.md rule 2)

### 2026-11-11 · agents · Use the user's own AI instead of paying for inference

- **What happened:** We needed an AI chat agent while keeping the project at zero cost.
- **Lesson:** Expose functionality as an MCP server so users run it inside the AI they already pay for (Claude, ChatGPT, Gemini CLI, Cursor…). Any built-in chat must be BYO-key or local (Ollama).
- **Source:** agent:claude-code (planning)
- **Status:** promoted (→ AGENTS.md rule 1)

### 2026-11-11 · oss · Personal email in git history

- **What happened:** The local git config uses a personal email, and every commit made public would expose it.
- **Lesson:** Before the repo goes public, commit with the GitHub noreply email and run a secret/PII scan (gitleaks) over the history.
- **Source:** agent:claude-code (planning)
- **Status:** active
