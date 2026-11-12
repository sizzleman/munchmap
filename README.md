# 🍕 munchmap

**Skyscanner for food, built for broke college students.**
munchmap finds the cheapest way to eat near you. It compares student discounts, weekly specials, loyalty programs, delivery-app fees and pickup, so you don't have to check five apps.

Free · open source · no accounts · no tracking · runs inside the AI you already use.

> 🚧 **Early days (v0.1).** Launch coverage: UIUC · UMass Amherst · UC Santa Cruz · UT Austin · Claremont McKenna · UBC · UofT · Western · Dubai.
> Your campus isn't here? [Add it](CONTRIBUTING.md#add-a-campus); it's just a data file.

## How it works
- **Community deal registry:** verified deals live as small YAML files in [`data/`](data/). Every deal has a source link and a "last verified" date.
- **Real-price math:** DoorDash vs Uber Eats vs the restaurant's own site vs pickup, including fees, tax, tip and your memberships (DashPass, Uber One…).
- **Nearby restaurants:** from [OpenStreetMap](https://www.openstreetmap.org/copyright).
- **Your AI does the talking:** munchmap is an [MCP](https://modelcontextprotocol.io) server. Plug it into Claude, ChatGPT, Gemini CLI, Cursor and others, then just ask: *"cheap spicy food near UofT under $12, I have Uber One."*
- **Privacy first:** your preferences stay on your device. Find a deal in your email? Your AI pulls out only the public facts, and you choose whether to share them. See [docs/PRIVACY.md](docs/PRIVACY.md).

We never scrape delivery apps and never place orders for you. [Why?](docs/PLAN.md#1-the-hard-truth-first-where-does-the-data-come-from)

## Quickstart (2 minutes)
Needs [Node.js 20+](https://nodejs.org).
```bash
git clone https://github.com/sizzleman/munchmap.git
cd munchmap
npm install
npm test            # make sure everything works
```

### Connect it to your AI
**Claude Desktop:** Settings → Developer → Edit Config, then add:
```json
{
  "mcpServers": {
    "munchmap": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/TO/munchmap/packages/mcp-server/src/index.ts"]
    }
  }
}
```
**Claude Code:** `claude mcp add munchmap -- npx tsx /ABSOLUTE/PATH/TO/munchmap/packages/mcp-server/src/index.ts`

**Gemini CLI / Cursor / Antigravity / others:** add the same `command` + `args` as a stdio MCP server in that tool's MCP settings.

**ChatGPT:** ChatGPT connects to *remote* MCP servers. A hosted endpoint is on the [roadmap](docs/PLAN.md).

Then try:
- "Set my home campus to uiuc. I have DashPass."
- "What food deals are on right now near campus?"
- "Find pizza places within 1 km."
- "Pickup is $12, DoorDash is $15 + $3.99 delivery. Which is cheaper really?"
- Use the prompt **find_deals_in_my_inbox** to scan your email for deals, privately.

### MCP tools
| Tool | What it does |
|---|---|
| `list_coverage` | Campuses and cities with data |
| `find_deals` | Deals near a campus or city: filter by pickup/delivery, student-only, open now, price |
| `find_restaurants` | Nearby restaurants from OpenStreetMap |
| `compare_channels` | True total per app or pickup: fees, tax, tip, memberships |
| `get_profile` / `set_profile` | Your preferences, saved only on your device |
| `prepare_deal_submission` | Turns a deal you found into a scrubbed, prefilled submission. Nothing is sent until you click. |

## Contribute: no coding needed
- 🍔 **Add a deal:** [open the "New deal" form](https://github.com/sizzleman/munchmap/issues/new?template=new-deal.yml)
- 🎓 **Add your campus:** see [CONTRIBUTING.md](CONTRIBUTING.md#add-a-campus)
- 🛠 **Code:** see [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) (AI coding agents read this too)

## Project docs
[Roadmap](docs/PLAN.md) · [Privacy](docs/PRIVACY.md) · [Licensing](docs/LICENSING.md) · [Lessons learned](LESSONS.md) · [Credits](THIRD_PARTY_NOTICES.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security](SECURITY.md)

## License
- Code: [AGPL-3.0-or-later](LICENSE). Free to use, modify and self-host. If you run a modified version as a public service, you share your changes.
- Data: [CC BY-SA 4.0](data/LICENSE). Restaurant data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).

munchmap isn't affiliated with any restaurant or delivery platform. Deals are community-sourced, so always confirm with the restaurant.
