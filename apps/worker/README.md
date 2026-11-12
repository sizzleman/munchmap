# munchmap remote MCP endpoint (Cloudflare Worker)

A hosted, **stateless** MCP endpoint at `https://<your-worker>.workers.dev/mcp`. It lets people use munchmap from AI apps that can't run local servers: ChatGPT, Grok, Claude on web and mobile, and Meta Muse (through a connector submission). Nobody has to install anything.

**Cost:** $0. The Cloudflare Workers free plan allows 100,000 requests a day with no credit card.
**Privacy:** no accounts, no sessions and no profile storage. Request logging (`observability`) is disabled in `wrangler.toml`. Profile tools are disabled here; users pass memberships as tool arguments instead.
**AGPL §13:** `GET /` returns a link to the source code, which satisfies the requirement to offer source to network users.

## Deploy (maintainers, about 5 minutes)
```bash
npm install
npm run build:data              # bundles data/ → public/data.json (baked into the Worker)
cd apps/worker
npx wrangler@4 login            # opens the browser; free Cloudflare account
npx wrangler@4 deploy
```
Redeploy whenever deals change. CI can do this automatically once you add a `CLOUDFLARE_API_TOKEN` secret (see the roadmap).

Self-hosting without Cloudflare: `npm run serve:mcp` serves the same endpoint at `http://localhost:8787/mcp`. Put it behind any HTTPS host or tunnel.

## Connect AI apps
| App | How |
|---|---|
| **ChatGPT** | Settings → Apps & Connectors → Advanced → Developer mode → add a connector with URL `https://<worker>/mcp` (no auth) |
| **Claude (web/desktop/mobile)** | Settings → Connectors → Add custom connector → URL `https://<worker>/mcp` |
| **Grok (xAI API)** | Add a remote MCP tool with `server_url: https://<worker>/mcp` |
| **Meta Muse** | The consumer app doesn't take custom MCP URLs yet. Submit munchmap as a connector at Meta's developer platform (it goes through review), or use Muse Code, which supports MCP. |
| **Gemini CLI / Cursor / Antigravity** | Add an HTTP MCP server with URL `https://<worker>/mcp`, or use the local `npx munchmap-mcp` |

The menu names above change often; check each app's current docs.

## Notes
- Tools: `list_coverage`, `find_deals`, `find_restaurants`, `compare_channels`, `prepare_deal_submission`, plus the `find_deals_in_my_inbox` prompt.
- `find_restaurants` calls public OpenStreetMap Overpass servers from Cloudflare's IPs. If usage grows, set `overpassUrl` to a dedicated instance, or cache results in Workers KV (free tier).
