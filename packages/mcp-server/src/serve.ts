#!/usr/bin/env node
/**
 * Self-host the remote MCP endpoint with plain Node: `npm run serve:mcp` → http://localhost:8787/mcp
 * Put it behind any HTTPS tunnel/host to use it from ChatGPT, Grok or Claude on the web.
 */
import { createServer as createHttpServer } from "node:http";
import { getDataset } from "./data.ts";
import { handleMcpHttp } from "./http.ts";

const port = Number(process.env.PORT ?? 8787);
const ctx = { getDataset, repo: process.env.MUNCHMAP_REPO, overpassUrl: process.env.MUNCHMAP_OVERPASS_URL };

createHttpServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const response = await handleMcpHttp(request, ctx);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error("[munchmap] request failed:", (e as Error).message);
    res.writeHead(500).end("Internal error");
  }
}).listen(port, () => console.error(`[munchmap] remote MCP on http://localhost:${port}/mcp`));
