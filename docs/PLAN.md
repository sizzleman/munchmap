# munchmap: plan & roadmap

> Skyscanner for food, built for broke college students. A free, open-source tool that finds the cheapest and best food near you for pickup and delivery. It pulls together deals from delivery apps, restaurants' own sites and apps, loyalty programs, surplus-food apps and student discounts.

Last updated: 2026-11-12 · Status: **Phase 1 nearly done · Phase 2 started**

## Launch coverage
| Campus | slug | City | Region |
|---|---|---|---|
| University of Illinois Urbana-Champaign | `uiuc` | Champaign-Urbana | US-IL |
| UMass Amherst | `umass` | Amherst | US-MA |
| UC Santa Cruz | `ucsc` | Santa Cruz | US-CA |
| UT Austin | `ut-austin` | Austin | US-TX |
| Claremont McKenna College (and the 5Cs) | `cmc` | Claremont | US-CA |
| University of British Columbia | `ubc` | Vancouver | CA-BC |
| University of Toronto | `uoft` | Toronto | CA-ON |
| Western University | `western` | London, ON | CA-ON |
| All of Dubai | n/a | Dubai | AE-DU |

**Strategy:** go deep on campuses where we personally know students rather than thin everywhere. Each campus gets a "campus captain" (a friend there) who adds and verifies deals.

---

## 1. Where the data comes from (and why we never scrape)
DoorDash, Uber Eats, Skip, Grubhub, Talabat, Deliveroo and Too Good To Go **don't offer public consumer APIs, and their terms ban scraping.** Instead, data comes from these sources:

| Layer | Status | What | How |
|---|---|---|---|
| Community deal registry | ✅ | Student discounts, weekly specials, loyalty programs | YAML in `data/`, submitted by issue form or PR, validated in CI |
| Platform knowledge base | ✅ | Membership prices and perks (DashPass, Uber One, Skip+, talabat pro…) | `data/<CC>/_national/platforms/` |
| OpenStreetMap | ✅ | Nearby restaurants, cuisine, hours, websites | Overpass API, live with attribution |
| User inbox (via the user's own AI) | ✅ | Deals in promo emails | MCP prompt `find_deals_in_my_inbox` + `prepare_deal_submission` (see PRIVACY.md) |
| Screenshot, link and share-sheet uploads | Phase 2 | Deals people see online or on Instagram | Local extraction → scrub → review → submit |
| Browser extension (user-side) | Phase 3 | Live prices from the user's own logged-in sessions | Runs on the user's device only |
| Android notifications | Phase 3 | Push deals from food apps | Opt-in companion app; filtering happens on the device |

## 2. Architecture
```
GitHub repo (free) ── data/ (CC BY-SA) ── CI validates, nightly expiry ── public/data.json
        │
        ├── packages/core         schemas · deal search · effective price · privacy scrubbers
        ├── packages/mcp-server   ← the user's own AI (Claude, ChatGPT, Gemini, Cursor, Antigravity, Grok…)
        ├── apps/web (Phase 1b)   static PWA on GitHub/Cloudflare Pages
        └── bots (Phase 2)        Telegram first; WhatsApp/iMessage self-host
```
Total running cost to the project: **$0**. Users bring their own AI. See `docs/PRIVACY.md` for how an optional hosted version stays private (local-first, end-to-end-encrypted sync, nothing personal centralized).

## 3. Roadmap

### Phase 0: Foundations ✅ (2026-11-12)
- [x] Name: **munchmap**. Private repo on GitHub.
- [x] npm-workspaces TypeScript monorepo with Biome, Vitest and GitHub Actions CI
- [x] Schemas for deals, regions and campuses, and platforms/memberships
- [x] 9 launch areas mapped; 20 researched deals and 11 platform membership files, each with a source
- [x] Open-source files: LICENSE (AGPL-3.0), data/LICENSE (CC BY-SA 4.0), CONTRIBUTING (DCO), CODE_OF_CONDUCT, SECURITY, THIRD_PARTY_NOTICES, issue forms, PR template
- [x] AI-agent setup: AGENTS.md, CLAUDE.md, Antigravity rules, LESSONS.md, 4 skills, 4 subagents
- [x] Git commits use the GitHub noreply email

### Phase 1: MVP (in progress)
- [x] `core`: deal search (campus/city/national, mode, student, open-now, price), effective-price engine, PII scrubbing, tests
- [x] MCP server: 7 tools + inbox prompt, with an end-to-end smoke test
- [x] Validator: schema, IDs, currency, stale/expired deals, tracking-URL and prompt-injection checks
- [ ] **Seed data:** 10+ verified deals per campus. Campus captains handle this; research agents found it hard to verify local deals from public pages alone. Gaps: CMC (0), Austin (1 + national), Western/UBC/UofT (mostly on-campus meal plans).
- [ ] Verify flagged platform prices (Grubhub+, Deliveroo Plus, talabat pro, noon One, Uber One CA annual)
- [ ] Add US sales-tax data for the 5 US cities (good first issues)
- [x] `apps/web`: static PWA with Deals, Compare (real-price calculator + memberships), Nearby (OSM) and Share a deal (scrubbed → prefilled issue)
- [x] `npm run build:mcp` produces a self-contained `munchmap-mcp` package. **To do:** publish it (needs your npm account)
- [x] Deal bot: issues with a YAML block (from the web app or MCP) become PRs automatically; plain forms get labeled `needs-triage`
- [ ] **Go public:** run gitleaks over the history, enable branch protection, Dependabot, secret scanning, private vulnerability reporting and Discussions, install the DCO app, and seed 10 good first issues

### Phase 2: Personalization and easy submissions
- [ ] Auto-deploy the Worker from CI (`CLOUDFLARE_API_TOKEN` secret) whenever `data/` changes
- [ ] Cache OSM results in Workers KV (free tier) to go easy on public Overpass servers
- [ ] Profile-aware ranking (diet, budget, memberships you already pay for, loyalty programs)
- [ ] Screenshot/link upload with local extraction (web) and the same scrub-and-review flow
- [ ] Telegram bot (self-hostable; BYO AI key or local Ollama)
- [ ] Community verification: "still valid?" votes; deals with many 👎 get re-checked
- [x] Remote MCP endpoint (stateless HTTP; Cloudflare Worker or Node). **To do:** deploy it (needs your free Cloudflare account) and submit it to the Meta Muse connector catalog
- [ ] Optional anonymous submission Worker for people without GitHub accounts

### Phase 3: Live prices, notifications, ordering hand-off
- [ ] Browser extension: read prices from the user's own open delivery-app pages to power `compare_channels`; nothing leaves the device
- [ ] Android companion app for notification capture (opt-in, filtered on the device)
- [ ] **Order hand-off:** munchmap prepares the cheapest channel, a deep link, the items and the promo. The user's own computer-use agent (Claude in Chrome, ChatGPT agent, Gemini, Grok…) carries it out in the user's own session and asks for confirmation before paying. munchmap never stores payment info.
- [ ] Optional end-to-end-encrypted profile sync for the hosted version
- [ ] WhatsApp (self-host, Meta Cloud API) and iMessage (BlueBubbles, community-led)

### Non-goals
Placing orders server-side, storing payment details, scraping delivery platforms, ads, selling data, paid tiers.

## 4. AI integrations: what's realistic
| Integration | Feasibility | Notes |
|---|---|---|
| Claude (Desktop/Code), Gemini CLI, Cursor, Antigravity | ✅ Now | Local stdio MCP |
| ChatGPT | ✅ once deployed | Remote MCP endpoint built (`apps/worker`) |
| Grok | ✅ once deployed | xAI remote MCP tools → same endpoint |
| Email deal extraction | ✅ Now | Uses the user's own AI email connector plus our scrub-and-review tools |
| Computer-use ordering | Phase 3 | User-initiated hand-off only (see above) |
| Meta Muse | Catalog submission | The consumer app has no custom MCP setting yet. Submit the hosted endpoint at Meta's developer platform (it goes through review), or use Muse Code, which supports MCP. |

## 5. How the project learns over time
`AGENTS.md` (rules) ← promoted from `LESSONS.md` (shared log) ← written by humans and agents after every surprise. Skills encode repeatable workflows. Subagents on Haiku handle cheap bulk work (research, validation), and Sonnet handles code and reviews. See the table in AGENTS.md.
