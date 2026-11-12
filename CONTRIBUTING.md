# Contributing to munchmap

Thanks for helping students eat better for less! There are three ways to help, from easiest to hardest.

## 1. Add a deal (no code)
Use the [New deal form](https://github.com/sizzleman/munchmap/issues/new?template=new-deal.yml). A maintainer (or a bot, later) turns it into a data file.

**Rules for deals**
- It must be **public**: anyone can get it. No personal or single-use codes, no "just for you" offers.
- Give a **source link** to a public page (restaurant site, official social post, campus page, news). No email tracking links.
- Describe it in your own words. Don't paste marketing copy or images.
- Don't include personal info: names, emails, order numbers, screenshots that show your account.

Prefer editing YAML? Copy any file in `data/<country>/<region>/deals/` and follow the [add-deal guide](.claude/skills/add-deal/SKILL.md).

## 2. Add a campus
Campuses are **data only**: edit `data/<CC>/<REGION>/region.yaml` and add your campus under `campuses:` (and the city under `cities:` if it's new). Then add a few deals. Full guide: [add-region](.claude/skills/add-region/SKILL.md).

## 3. Code
```bash
npm install
npm test               # unit + MCP smoke tests
npm run lint           # Biome
npm run typecheck
npm run validate:data  # checks every YAML file
npm run dev:mcp        # run the MCP server locally
```
- Read [AGENTS.md](AGENTS.md) first. It holds the project rules for humans and AI agents alike, and the most important ones (no scraping, zero cost, privacy) are non-negotiable.
- Skim [LESSONS.md](LESSONS.md) so you don't repeat past mistakes. If you learn something non-obvious, add a lesson in your PR.
- Keep PRs small and focused, and use [conventional commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `data:`, `docs:`.

### Sign your commits (DCO)
We use the [Developer Certificate of Origin](https://developercertificate.org/) instead of a CLA. Add `-s` to your commits:
```bash
git commit -s -m "data: add Antonio's slice deal (amherst)"
```
This adds `Signed-off-by: Your Name <email>`, certifying you wrote the change or have the right to submit it under the project's licenses.
Tip: use your [GitHub noreply email](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address) to keep your address private.

### Adding a dependency or data source
- Its license must be compatible with AGPL-3.0. CI runs `npm run licenses:check`.
- Add it to [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) in the same PR, with attribution requirements.
- Data sources must pass the policy gate in the [add-adapter guide](.claude/skills/add-adapter/SKILL.md): official API, open data, community, user-side, or deep links only. **Never server-side scraping of delivery platforms.** Nothing that costs money.

### Using AI coding tools
Welcome! `AGENTS.md` is the shared rulebook for Claude Code, Antigravity/Gemini, Cursor, Codex and others. Skills (`.claude/skills/`) and subagents (`.claude/agents/`) are written as plain Markdown, so any tool can follow them. You're responsible for what you submit, so review AI output before opening a PR.

## Licensing of contributions
By contributing you agree that your code is licensed under [AGPL-3.0-or-later](LICENSE) and your data contributions under [CC BY-SA 4.0](data/LICENSE). See [docs/LICENSING.md](docs/LICENSING.md).

## Code of Conduct
Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
