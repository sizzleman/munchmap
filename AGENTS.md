# AGENTS.md

Instructions for **any AI coding agent** (Claude Code, Antigravity/Gemini, Cursor, Codex, Copilot …) and a quick orientation for human contributors.
This is the single source of truth. Tool-specific files (`CLAUDE.md`, `.agent/rules/`) only point here.

## What this project is

**munchmap** is a free, open-source "Skyscanner for food". It compares deals and the _effective price_ of food across delivery apps, restaurants' own channels, pickup, loyalty programs and student discounts, so college students can eat well for less.
Launch campuses: UIUC, UMass Amherst, UC Santa Cruz, UT Austin, Claremont McKenna, UBC, UofT, Western, plus Dubai. Roadmap: `docs/PLAN.md`. Privacy design: `docs/PRIVACY.md`. Licensing: `docs/LICENSING.md`.

## Before you start any task

1. Read `LESSONS.md`. It holds past mistakes and insights; don't repeat them.
2. Check `docs/PLAN.md` to see which phase the task belongs to. Don't build Phase 3 features during Phase 1.
3. If a matching skill exists in `.claude/skills/` (add-deal, add-adapter, add-region, capture-lesson), follow its steps. Other tools can read those SKILL.md files as plain instructions.

## Non-negotiable rules

1. **Zero cost.** Don't add paid services, paid APIs or anything that needs a hosted backend we pay for. Every feature has to run locally, as static files, or on free tiers that need no credit card.
2. **No server-side scraping of delivery platforms** (DoorDash, Uber Eats, Skip, Grubhub, Talabat, Deliveroo, Too Good To Go, etc.). Allowed data access methods are, in order of preference:
   `official_api` → `open_data` → `community` → `user_side` (runs on the user's own device or session) → `deep_link_only`.
   Every source adapter declares its `access_method`. If you're unsure whether something is allowed, stop and ask.
3. **Privacy first.** User profiles, subscriptions and location stay on the user's device. No telemetry. Hosted code (Worker, web) must stay stateless: no accounts, no logging of tool arguments. `packages/core` must stay browser-safe (no `node:` imports outside `node.ts`/`load.ts`). Never commit secrets; use `.env` (gitignored) and keep `.env.example` up to date.
4. **Trust over coverage.** Every price or deal shown must include its source and `verified_at` date. Never invent deals, prices or fees, and never put plausible-looking fake data in `data/`. Test fixtures go in `**/__fixtures__/` and are clearly fake (e.g. "Example Pizza").
5. **Attribution.** OpenStreetMap data must show "© OpenStreetMap contributors" (ODbL). Respect the Overpass/Nominatim usage policies: cache results, rate-limit, and send a generic User-Agent with no personal info.
6. **Regions are data, not code.** Adding a city or country should only mean adding files under `data/` and `regions/`, with no changes in `core`. If you have to change code to add a region, fix the abstraction instead.
7. **Money is integers.** Store amounts in minor units (cents/fils) with an ISO 4217 currency code. Never use floats for money.
8. **Credit everything.** Each new dependency, data source, or adapted doc goes into `THIRD_PARTY_NOTICES.md` in the same PR. Licenses must be AGPL-3.0 compatible (`npm run licenses:check`). Code is AGPL-3.0-or-later, `data/` is CC BY-SA 4.0, and commits need DCO sign-off (`git commit -s`).
9. **Clean sources only.** A `source_url` must be a public page with no email tracking or personal query parameters (the validator enforces this). Record facts in your own words. Never copy marketing text, logos, or images.
10. **The user stays in control.** Nothing gets submitted, ordered, or shared on a user's behalf without an explicit action from them. Tools draft and the user sends.

## Architecture (target, see docs/PLAN.md §2)

```
packages/core/              ✅ browser-safe: schemas, deal search, effective price, privacy scrubbers,
                               submission drafts, OSM lookup.   "@munchmap/core/node" = filesystem loader
packages/mcp-server/        ✅ server.ts (tool definitions, shared) · index.ts (stdio, local profile)
                               http.ts (stateless Streamable HTTP) · serve.ts (Node self-host)
apps/web/                   ✅ static PWA (Vite + vanilla TS); renders community text via textContent only
apps/worker/                ✅ Cloudflare Worker wrapping http.ts; data baked in at deploy
packages/sources/<x>/       ⏳ future adapters; each exports { id, accessMethod, regions, fetch() }
data/<CC>/<REGION>/         region.yaml (cities + campuses), deals/*.yaml
data/<CC>/_national/        deals/*.yaml (region "*"), platforms/*.yaml (fees + memberships)
archive/                    expired deals (moved by the nightly workflow)
public/                     PWA assets + generated data.json (served by web app and Pages)
scripts/                    validate-data, build-data, expire-deals, check-licenses, build-mcp, issue-to-deal (bot)
```

## Commands

npm workspaces, so there's nothing extra to install. Use Node 20+ (`.nvmrc` pins 22).

```
npm install
npm test               # vitest: core unit tests + MCP end-to-end smoke test
npm run lint           # biome (does not touch Markdown)
npm run format         # biome autofix
npm run typecheck      # tsc --noEmit
npm run validate:data  # schema + policy checks on data/ (errors fail CI)
npm run build:data     # data/ → public/data.json
npm run expire:deals   # move expired deals to archive/
npm run licenses:check # dependency license gate (add -- --table to list)
npm run dev:mcp        # run the MCP server on stdio
npm run serve:mcp      # remote MCP over HTTP at :8787/mcp
npm run dev:web        # web app at :5173
npm run build:web      # static site → apps/web/dist
npm run build:mcp      # npm package → dist/munchmap-mcp
```

## Conventions

- TypeScript strict mode. ESM only. Node ≥ 20.
- Validate every external input (YAML, API responses, MCP tool args) with Zod at the boundary.
- File names are kebab-case. Deal IDs follow `<cc>-<region>-<city>-<brand>-<slug>`, e.g. `ca-on-toronto-example-pizza-tuesday-large`.
- Dates are ISO 8601 (`2026-11-11`). Time-of-day deals use the location's IANA timezone.
- Small PRs. Each one adds or changes one adapter, one feature, or one batch of data for one city.
- Conventional commits: `feat:`, `fix:`, `data:`, `docs:`, `chore:`, `test:`.
- Every new code path in `core` needs tests. The effective-price engine needs table-driven tests per region.

## Definition of done

- [ ] `npm run lint && npm run typecheck && npm test && npm run validate:data` pass
- [ ] Docs updated (README / CONTRIBUTING / this file) if behaviour or commands changed
- [ ] If you hit a non-obvious problem or got corrected, you added a `LESSONS.md` entry (see `.claude/skills/capture-lesson`)

## Self-improvement loop

- **Learn:** after any task where something surprised you, failed, or the human corrected you, append an entry to `LESSONS.md`.
- **Promote:** when the same lesson shows up 2+ times, or it's clearly a rule, propose moving it into this file in the same PR and mark the lesson `promoted`.
- **Prune:** if a rule here becomes obsolete, remove it in a PR that explains why. Keep this file short; agents follow short files better.

## When unsure

Ask the human. Prefer a small, reversible change and a clear question over a large guess.
