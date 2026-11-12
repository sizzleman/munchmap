import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..", "..");
let client: Client;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  return { ...res, data: res.isError ? null : JSON.parse(res.content[0]?.text ?? "null") };
};

beforeAll(async () => {
  client = new Client({ name: "smoke-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: join(root, "node_modules", ".bin", "tsx"),
      args: [join(root, "packages", "mcp-server", "src", "index.ts")],
      env: {
        ...(process.env as Record<string, string>),
        MUNCHMAP_DATA: join(root, "packages", "core", "src", "__fixtures__", "data"),
        MUNCHMAP_HOME: mkdtempSync(join(tmpdir(), "munchmap-")),
      },
    }),
  );
}, 20_000);
afterAll(() => client?.close());

describe("munchmap MCP server", () => {
  it("lists tools and prompts", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "compare_channels",
      "find_deals",
      "find_restaurants",
      "get_profile",
      "list_coverage",
      "place_details",
      "prepare_deal_submission",
      "prepare_place_submission",
      "set_profile",
    ]);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(expect.arrayContaining(["find_deals_in_my_inbox", "review_sweep"]));
  });

  it("profile round-trips and drives find_deals", async () => {
    await call("set_profile", { home_campus: "test-u", memberships: ["dashpass"] });
    const { data } = await call("find_deals", {});
    expect(data.campus).toBe("test-u");
    expect(data.count).toBeGreaterThan(0);
  });

  it("compare_channels ranks pickup first", async () => {
    const { data } = await call("compare_channels", {
      country: "US",
      region: "IL",
      quotes: [
        { channel: "doordash", subtotal_minor: 1500, delivery_fee_minor: 399 },
        { channel: "pickup", subtotal_minor: 1200 },
      ],
    });
    expect(data.cheapest).toBe("pickup");
  });

  it("prepare_deal_submission scrubs personal data and drops personal codes", async () => {
    const { data } = await call("prepare_deal_submission", {
      title: "BOGO burritos for jane@example.com",
      brand: "Example Burrito",
      country: "US",
      region: "IL",
      city: "champaign",
      channels: ["pickup"],
      type: "bogo",
      promo_code: "X7KQ9P2M4Z",
      source_url: "https://burrito.example/deals?utm_source=email&uid=42",
    });
    expect(data.ok).toBe(true);
    expect(data.yaml).not.toContain("jane@example.com");
    expect(data.yaml).not.toContain("X7KQ9P2M4Z");
    expect(data.yaml).toContain("https://burrito.example/deals");
    expect(data.yaml).not.toContain("uid=42");
    expect(data.issue_url).toMatch(/^https:\/\/github\.com\/.+\/issues\/new\?/);
  });

  it("prepare_place_submission drafts menu + rating without sending", async () => {
    const { data } = await call("prepare_place_submission", {
      name: "Example Pizza",
      lat: 40.11,
      lon: -88.24,
      menu: [{ name: "Cheese slice", price_minor: 350 }],
      menu_source: "photo",
      rating: { worth_it: 5, note: "call me at 217-555-0100" },
    });
    expect(data.ok).toBe(true);
    expect(data.yaml).toContain("kind: place");
    expect(data.yaml).not.toContain("555-0100");
  });

  it("review_sweep prompt tells the AI to cite sources and not invent reviews", async () => {
    const res = await client.getPrompt({
      name: "review_sweep",
      arguments: { restaurant: "Example Pizza", city: "Champaign IL" },
    });
    const text = (res.messages[0]?.content as { text: string }).text;
    expect(text).toContain("Never invent reviews");
    expect(text).toContain("place_details");
  });
});
