import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadDataDir } from "@munchmap/core/node";
import { describe, expect, it } from "vitest";
import { handleMcpHttp } from "../src/http.ts";

const { issues: _issues, ...dataset } = loadDataDir(
  join(import.meta.dirname, "..", "..", "core", "src", "__fixtures__", "data"),
);
const ctx = { getDataset: async () => dataset };
const inProcessFetch = (url: string | URL | Request, init?: RequestInit) => handleMcpHttp(new Request(url, init), ctx);

describe("remote MCP (stateless HTTP)", () => {
  it("serves info with AGPL source link at /", async () => {
    const res = await handleMcpHttp(new Request("https://mcp.example/"), ctx);
    const body = (await res.json()) as { source_code: string; license: string };
    expect(body.license).toBe("AGPL-3.0-or-later");
    expect(body.source_code).toMatch(/github\.com/);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("works end-to-end with an MCP client and exposes no profile tools", async () => {
    const client = new Client({ name: "http-test", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("https://mcp.example/mcp"), { fetch: inProcessFetch }),
    );
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("find_deals");
    expect(names).not.toContain("set_profile");
    const res = (await client.callTool({ name: "find_deals", arguments: { campus: "test-u" } })) as {
      content: { text: string }[];
    };
    expect(JSON.parse(res.content[0]?.text ?? "{}").count).toBeGreaterThan(0);
    const cmp = (await client.callTool({
      name: "compare_channels",
      arguments: {
        country: "US",
        region: "IL",
        memberships: ["dashpass"],
        quotes: [{ channel: "pickup", subtotal_minor: 1000 }],
      },
    })) as { content: { text: string }[] };
    expect(JSON.parse(cmp.content[0]?.text ?? "{}").cheapest).toBe("pickup");
    await client.close();
  });

  it("404s unknown paths", async () => {
    expect((await handleMcpHttp(new Request("https://mcp.example/nope"), ctx)).status).toBe(404);
  });
});
