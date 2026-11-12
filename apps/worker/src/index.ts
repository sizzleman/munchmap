/**
 * Cloudflare Worker hosting munchmap's remote MCP endpoint at /mcp.
 * Data is bundled at deploy time from public/data.json (run `npm run build:data` first).
 * Free tier: 100k requests/day, no credit card. Stateless — stores nothing about users.
 */
import { parseDataset } from "@munchmap/core";
import { handleMcpHttp } from "@munchmap/mcp-server/http";
import bundle from "../../../public/data.json" with { type: "json" };

const dataset = parseDataset(bundle);
const ctx = { getDataset: async () => dataset };

export default {
  fetch(request: Request): Promise<Response> {
    return handleMcpHttp(request, ctx);
  },
};
