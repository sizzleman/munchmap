# 🍕 munchmap

**Skyscanner for food, built for broke college students.** 👉 **[Open the app](https://sizzleman.github.io/munchmap/)**
munchmap finds the cheapest way to eat near you, and **every price is all-in** (tax, fees and tip included), so there are no surprises at checkout. It compares student discounts, weekly specials, loyalty programs, delivery-app fees and pickup, so you don't have to check five apps.

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

## Use it
There are three ways in. Pick whichever is easiest.

| | Best for | Setup |
|---|---|---|
| 🌐 **Web app** | Anyone on a phone or laptop | **[sizzleman.github.io/munchmap](https://sizzleman.github.io/munchmap/)**: pick your campus. You can install it to your home screen. |
| 🔌 **Hosted AI connector** | ChatGPT, Claude web/mobile, Grok, Meta Muse | Add the URL **`https://munchmap-mcp.munchmap.workers.dev/mcp`** as a connector. See [apps/worker](apps/worker/README.md). |
| 💻 **Local AI connector** | Claude Desktop/Code, Gemini CLI, Cursor, Antigravity | `npx -y munchmap-mcp` ([npm](https://www.npmjs.com/package/munchmap-mcp)), or run it from a clone (below) |

### Run from a clone (Node.js 20+)
```bash
git clone https://github.com/sizzleman/munchmap.git
cd munchmap
npm install
npm test             # make sure everything works
npm run dev:web      # web app at http://localhost:5173
npm run serve:mcp    # remote-style MCP endpoint at http://localhost:8787/mcp
```

### Connect a local AI app
**Claude Code:** `claude mcp add munchmap -- npx -y munchmap-mcp`

**Claude Desktop:** Settings → Developer → Edit Config:
```json
{
  "mcpServers": {
    "munchmap": { "command": "npx", "args": ["-y", "munchmap-mcp"] }
  }
}
```
Working on munchmap itself? Point it at your clone instead: `"args": ["tsx", "/ABSOLUTE/PATH/TO/munchmap/packages/mcp-server/src/index.ts"]`.

**Gemini CLI / Cursor / Antigravity / others:** add the same `command` + `args` as a stdio MCP server.

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
| `get_profile` / `set_profile` | Your preferences, saved only on your device (local connector only) |
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
