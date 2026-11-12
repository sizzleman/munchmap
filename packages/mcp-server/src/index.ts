#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
/**
 * munchmap MCP server — plug this into the AI you already use (Claude, ChatGPT, Gemini CLI, Cursor…)
 * so it can find cheap food near you. Runs locally over stdio; costs the project nothing.
 */
import { Channel, Currency, compareChannels, DealType, findDeals, formatMoney, Weekday } from "@munchmap/core";
import { z } from "zod";
import { getDataset } from "./data.ts";
import { findRestaurants, OSM_ATTRIBUTION } from "./osm.ts";
import { readProfile, writeProfile } from "./profile.ts";
import { prepareSubmission, REPO } from "./submit.ts";

const server = new McpServer({ name: "munchmap", version: "0.1.0" });

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

server.registerTool(
  "list_coverage",
  {
    title: "List supported campuses and cities",
    description:
      "Lists every campus, city and region munchmap has data for, with deal counts. Call this first if unsure.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    const { regions, deals } = await getDataset();
    return json(
      regions.map((r) => ({
        country: r.country,
        region: r.region,
        name: r.name,
        currency: r.currency,
        cities: r.cities.map((c) => c.slug),
        campuses: r.campuses.map((c) => ({ slug: c.slug, name: c.name })),
        deals: deals.filter((d) => d.country === r.country && (d.region === r.region || d.region === "*")).length,
      })),
    );
  },
);

server.registerTool(
  "find_deals",
  {
    title: "Find food deals",
    description:
      "Find verified food deals (student discounts, weekly specials, app promos) near a campus or city. " +
      "Every result includes source_url and verified_at — always show those to the user. " +
      "If no campus/city is given, the user's saved home_campus is used.",
    inputSchema: {
      campus: z.string().optional().describe("Campus slug, e.g. uiuc, uoft, ubc (see list_coverage)"),
      country: z.string().length(2).optional(),
      region: z.string().optional(),
      city: z.string().optional(),
      query: z.string().optional().describe("Free text, e.g. 'pizza' or 'boba'"),
      mode: z.enum(["pickup", "delivery", "any"]).optional(),
      student_only: z.boolean().optional(),
      active_now: z.boolean().optional().describe("Only deals valid right now (local time)"),
      max_price_minor: z.number().int().optional().describe("Max fixed price in cents/fils"),
      limit: z.number().int().min(1).max(50).default(15),
    },
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    const { deals, regions } = await getDataset();
    const profile = readProfile();
    const campus = args.campus ?? (args.city || args.country ? undefined : (profile.home_campus ?? undefined));
    const results = findDeals(deals, regions, {
      campus,
      country: args.country,
      region: args.region,
      city: args.city,
      query: args.query,
      mode: args.mode ?? profile.prefers,
      studentOnly: args.student_only,
      activeNow: args.active_now,
      maxPriceMinor: args.max_price_minor,
      limit: args.limit,
    });
    return json({
      campus: campus ?? null,
      count: results.length,
      deals: results.map((d) => ({
        ...d,
        display_value:
          d.value && "amount_minor" in d.value
            ? formatMoney(d.value.amount_minor, d.value.currency)
            : d.value
              ? `${d.value.percent}% off`
              : null,
      })),
      note: results.length
        ? "Deals are community-sourced; confirm at the source before ordering."
        : `No deals found. Users can add one with prepare_deal_submission or at https://github.com/${REPO}/issues/new/choose`,
    });
  },
);

server.registerTool(
  "find_restaurants",
  {
    title: "Find restaurants nearby",
    description:
      "Find restaurants, fast food and cafes near a campus or coordinates using OpenStreetMap. " +
      "Results include map links. Always include the attribution string in your answer.",
    inputSchema: {
      campus: z.string().optional(),
      lat: z.number().min(-90).max(90).optional(),
      lon: z.number().min(-180).max(180).optional(),
      cuisine: z.string().optional().describe("OSM cuisine tag, e.g. pizza, indian, sushi, burger, mexican"),
      radius_m: z.number().int().min(100).max(3000).default(1200),
      limit: z.number().int().min(1).max(50).default(20),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    let { lat, lon } = args;
    const campusSlug = args.campus ?? (lat === undefined ? readProfile().home_campus : null);
    if (campusSlug) {
      const { regions } = await getDataset();
      const c = regions.flatMap((r) => r.campuses).find((x) => x.slug === campusSlug);
      if (!c) return fail(`Unknown campus "${campusSlug}". Call list_coverage.`);
      ({ lat, lon } = c);
    }
    if (lat === undefined || lon === undefined) return fail("Provide a campus or lat/lon.");
    try {
      const restaurants = await findRestaurants({
        lat,
        lon,
        radius_m: args.radius_m,
        cuisine: args.cuisine,
        limit: args.limit,
      });
      return json({ attribution: OSM_ATTRIBUTION, count: restaurants.length, restaurants });
    } catch (e) {
      return fail((e as Error).message);
    }
  },
);

const QuoteSchema = z.object({
  channel: z.string().describe("e.g. pickup, ubereats, doordash, first_party_site"),
  subtotal_minor: z.number().int().nonnegative(),
  delivery_fee_minor: z.number().int().nonnegative().optional(),
  service_fee_minor: z.number().int().nonnegative().optional(),
  service_fee_bps: z.number().int().nonnegative().optional(),
  small_order_fee_minor: z.number().int().nonnegative().optional(),
  promo_minor: z.number().int().nonnegative().optional(),
  membership_free_delivery: z.boolean().optional(),
  tip_bps: z.number().int().nonnegative().optional(),
});

server.registerTool(
  "compare_channels",
  {
    title: "Compare the real price across apps/pickup",
    description:
      "Given what the user sees for the same order on different channels (pickup, each delivery app, the " +
      "restaurant's own site), compute the true total incl. fees, tax and tip and rank them. Amounts are integer " +
      "minor units (cents/fils). If tip_bps is omitted for delivery channels, the region's customary tip is used.",
    inputSchema: {
      country: z.string().length(2),
      region: z.string(),
      quotes: z.array(QuoteSchema).min(1).max(10),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ country, region, quotes }) => {
    const { regions, platforms } = await getDataset();
    const r = regions.find((x) => x.country === country && x.region === region);
    if (!r) return fail(`Unknown region ${country}/${region}. Call list_coverage.`);
    const profile = readProfile();
    const withTips = quotes.map((q) => ({
      ...q,
      tip_bps:
        q.tip_bps ??
        (q.channel === "pickup" || q.channel === "dine_in" ? 0 : Math.round(r.tipping.default_percent * 100)),
    }));
    const result = compareChannels(withTips, r.currency, r.tax);
    const memberships = platforms
      .filter((p) => p.country === country)
      .flatMap((p) => p.memberships.map((m) => ({ platform: p.platform, ...m })))
      .filter((m) => profile.memberships.includes(m.id));
    return json({
      ...result,
      ranked: result.ranked.map((p) => ({ ...p, total_display: formatMoney(p.total, r.currency) })),
      tax_note: r.tax ? (r.tax.note ?? null) : "Tax rate for this region is not in our data yet; totals exclude tax.",
      your_memberships: memberships,
    });
  },
);

server.registerTool(
  "get_profile",
  {
    title: "Read local preferences",
    description:
      "Read the user's local munchmap profile (home campus, diet, budget, memberships). Stored only on this device.",
    annotations: { readOnlyHint: true },
  },
  async () => json(readProfile()),
);

server.registerTool(
  "set_profile",
  {
    title: "Update local preferences",
    description:
      "Save preferences to the user's device only (~/.munchmap/profile.json). Ask before saving. " +
      "memberships use ids like dashpass, uber-one, grubhub-plus, skip-plus, talabat-pro.",
    inputSchema: {
      home_campus: z.string().nullable().optional(),
      diet: z.array(z.string()).optional(),
      favorite_cuisines: z.array(z.string()).optional(),
      avoid: z.array(z.string()).optional(),
      budget_per_meal: z.object({ amount_minor: z.number().int(), currency: Currency }).nullable().optional(),
      memberships: z.array(z.string()).optional(),
      loyalty_programs: z.array(z.string()).optional(),
      prefers: z.enum(["pickup", "delivery", "any"]).optional(),
    },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  async (args) => json(writeProfile(Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)))),
);

server.registerTool(
  "prepare_deal_submission",
  {
    title: "Draft a deal to share with the community",
    description:
      "Turn a deal the user found (in an email, notification, social post, flyer) into a community submission. " +
      "This NEVER sends anything: it strips personal info (emails, phone numbers, order numbers, tracking links, " +
      "single-use codes), validates the deal, and returns a prefilled GitHub issue link for the USER to review and submit. " +
      "Only pass deal facts — never paste the raw email/notification text.",
    inputSchema: {
      title: z.string(),
      brand: z.string(),
      country: z.string().length(2),
      region: z.string().describe("Region code like ON, IL, DU, or * for nationwide"),
      city: z.string().describe("City slug like toronto, or * for region-wide"),
      campuses: z.array(z.string()).optional(),
      channels: z.array(Channel),
      type: DealType,
      value: z
        .union([z.object({ amount_minor: z.number().int(), currency: Currency }), z.object({ percent: z.number() })])
        .nullable()
        .optional(),
      schedule: z
        .object({
          days: z.array(Weekday),
          start: z.string().nullable().optional(),
          end: z.string().nullable().optional(),
          tz: z.string(),
        })
        .nullable()
        .optional(),
      conditions: z.string().nullable().optional(),
      student_only: z.boolean().optional(),
      promo_code: z.string().nullable().optional(),
      source_url: z.string().describe("Public page for the deal (not an email tracking link)"),
      expires: z.string().nullable().optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async (args) => json(prepareSubmission(args)),
);

server.registerPrompt(
  "find_deals_in_my_inbox",
  {
    title: "Find food deals in my email (privately)",
    description:
      "Guides your AI to scan your own inbox for food deals, keep personal ones private, and optionally share public ones.",
  },
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Using my email connector, search my inbox from the last 14 days for food deals and promotions (restaurants, delivery apps, loyalty programs).",
            "Rules:",
            "1. Only extract deal facts: brand, offer, value, days/times, conditions, expiry, public landing page URL.",
            "2. Never include my name, email, address, phone, order numbers, or account details in anything you pass to a tool.",
            "3. Split results into (a) PERSONAL offers (single-use codes, 'just for you', account-specific) — show me these only, do not submit them, and (b) PUBLIC offers anyone can use.",
            "4. For public offers, call prepare_deal_submission and show me the issue link — I'll decide whether to submit.",
            "5. Then call find_deals for my home campus and tell me the best options right now, combining my personal offers with public deals.",
          ].join("\n"),
        },
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
console.error("[munchmap] MCP server running on stdio");
