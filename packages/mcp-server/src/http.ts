/**
 * Remote MCP over Streamable HTTP, using only web-standard Request/Response.
 * Runs on Cloudflare Workers (apps/worker) or Node (src/serve.ts).
 *
 * Stateless by design: no sessions, no accounts, no profile storage, no logging of tool arguments.
 * Each request gets a fresh server instance. This is what lets ChatGPT, Grok, Claude mobile/web
 * and (via a catalog submission) Meta Muse connect without installing anything.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer, type ServerContext, SOURCE_URL, VERSION } from "./server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

const withCors = (res: Response): Response => {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

export async function handleMcpHttp(req: Request, ctx: Omit<ServerContext, "profile">): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (url.pathname === "/" || url.pathname === "/health") {
    // AGPL §13: users interacting over a network must be offered the source code.
    return withCors(
      Response.json({
        name: "munchmap",
        version: VERSION,
        mcp_endpoint: `${url.origin}/mcp`,
        license: "AGPL-3.0-or-later",
        source_code: SOURCE_URL,
        privacy: "Stateless. No accounts, no profiles stored, tool arguments are not logged.",
      }),
    );
  }
  if (url.pathname !== "/mcp") return withCors(new Response("Not found", { status: 404 }));

  const server = createServer({ ...ctx, profile: undefined });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return withCors(await transport.handleRequest(req));
  } finally {
    // Fire-and-forget cleanup; the response body is already buffered (JSON mode).
    void server.close();
  }
}
