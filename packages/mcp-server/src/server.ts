/**
 * The munchmap MCP server definition, shared by every transport:
 *  - stdio (local, src/index.ts): full feature set incl. on-device profile
 *  - HTTP (src/http.ts → Node self-host or Cloudflare Worker): stateless, no profile storage
 * Uses only web-standard APIs so it runs in Node, Workers and other edge runtimes.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  Channel,
  Currency,
  compareChannels,
  type Dataset,
  DealType,
  dealAllIn,
  dealsForRestaurant,
  findDeals,
  findRestaurants,
  formatMoney,
  haversineMeters,
  isOpenNow,
  menuPriceSummary,
  namesMatch,
  OSM_ATTRIBUTION,
  type Profile,
  placeForRestaurant,
  placeLinks,
  preparePlaceSubmission,
  prepareSubmission,
  type Region,
  type Restaurant,
  ratingSummary,
  taxFor,
  Weekday,
} from "@munchmap/core";
import { z } from "zod";

export const VERSION = "0.2.0";
export const SOURCE_URL = "https://github.com/sizzleman/munchmap";

export interface ProfileStore {
  read(): Profile;
  write(update: Partial<Profile>): Profile;
}

export interface ServerContext {
  getDataset(): Promise<Dataset>;
  /** On-device profile storage. Omitted for hosted/remote servers (we store nothing about users). */
  profile?: ProfileStore;
  /** GitHub repo that receives deal submissions. */
  repo?: string;
  overpassUrl?: string;
}

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/** Which region/city a point belongs to: a campus slug, or the nearest known city within 60 km. */
function resolveArea(ds: Dataset, campus: string | null | undefined, lat?: number, lon?: number) {
  for (const r of ds.regions) {
    const c = campus ? r.campuses.find((x) => x.slug === campus) : undefined;
    if (c)
      return {
        region: r,
        city: c.city,
        cityName: r.cities.find((x) => x.slug === c.city)?.name ?? c.city,
        lat: c.lat,
        lon: c.lon,
      };
  }
  if (lat === undefined || lon === undefined) return null;
  let best: { region: Region; city: string; cityName: string; d: number } | null = null;
  for (const r of ds.regions)
    for (const c of r.cities) {
      const d = haversineMeters({ lat, lon }, c);
      if (!best || d < best.d) best = { region: r, city: c.slug, cityName: c.name, d };
    }
  return best && best.d < 60_000 ? { ...best, lat, lon } : null;
}

/** A restaurant plus everything munchmap knows about it, prices always all-in. */
function enrich(ds: Dataset, r: Restaurant, area: NonNullable<ReturnType<typeof resolveArea>>) {
  const ctxPlace = { country: area.region.country, region: area.region.region, city: area.city };
  const deals = dealsForRestaurant(r, ds.deals, ctxPlace);
  const place = placeForRestaurant(r, ds.places);
  const menu = place ? menuPriceSummary(place, area.region) : null;
  const money = (n: number) => formatMoney(n, area.region.currency);
  return {
    name: r.name,
    cuisine: r.cuisine,
    distance_m: r.distance_m,
    open_now: isOpenNow(r.opening_hours, area.region.timezone),
    opening_hours: r.opening_hours,
    diet: r.diet,
    takeaway: r.takeaway,
    delivery: r.delivery,
    deals: deals.map((d) => {
      const a = dealAllIn(d, area.region, area.city);
      return {
        title: d.title,
        all_in: a ? `${money(a.total_minor)}${a.excludes.length ? ` (+ ${a.excludes.join(", ")})` : ""}` : null,
        conditions: d.conditions,
        source_url: d.source_url,
        verified_at: d.verified_at,
      };
    }),
    prices_all_in: menu
      ? {
          from: money(menu.min_all_in),
          typical: money(menu.median_all_in),
          items: menu.items,
          updated: place?.menu_verified_at ?? null,
        }
      : null,
    student_rating: ratingSummary(place),
    links: [
      ...placeLinks(r, area.cityName, area.region.platforms),
      ...(r.website ? [{ label: "Website", url: r.website }] : []),
    ],
    osm: r.id,
  };
}

const INSTRUCTIONS = `munchmap finds cheap food for students: verified community deals, nearby restaurants (OpenStreetMap), and the real price of an order across pickup and delivery apps.
- Start with list_coverage if you don't know the user's campus.
- Always show each deal's source_url and verified_at; deals are community-sourced, so suggest confirming before ordering.
- Never send personal data (names, emails, order numbers, single-use codes) to prepare_deal_submission.
- munchmap never places orders. Point the user to the cheapest channel.
Free & open source (AGPL-3.0). Source code: ${SOURCE_URL}`;

export function createServer(ctx: ServerContext): McpServer {
  const server = new McpServer({ name: "munchmap", version: VERSION }, { instructions: INSTRUCTIONS });
  const readProfile = (): Partial<Profile> => ctx.profile?.read() ?? {};

  server.registerTool(
    "list_coverage",
    {
      title: "List supported campuses and cities",
      description:
        "Lists every campus, city and region munchmap has data for, with deal counts. Call this first if unsure.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { regions, deals } = await ctx.getDataset();
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
        "Find verified food deals (student discounts, weekly specials, loyalty programs) near a campus or city. " +
        "Every result includes source_url and verified_at — always show those to the user." +
        (ctx.profile ? " If no campus/city is given, the user's saved home_campus is used." : ""),
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
      const { deals, regions } = await ctx.getDataset();
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
      // Resolve the place so all-in prices use the right local tax.
      let placeRegion = regions.find((r) => r.country === args.country && r.region === args.region);
      let placeCity = args.city;
      if (campus)
        for (const r of regions) {
          const c = r.campuses.find((x) => x.slug === campus);
          if (c) {
            placeRegion = r;
            placeCity = c.city;
          }
        }
      return json({
        campus: campus ?? null,
        count: results.length,
        deals: results.map((d) => ({
          ...d,
          all_in: placeRegion ? dealAllIn(d, placeRegion, placeCity) : null,
          display_value:
            d.value && "amount_minor" in d.value
              ? formatMoney(d.value.amount_minor, d.value.currency)
              : d.value
                ? `${d.value.percent}% off`
                : null,
        })),
        note: results.length
          ? "Lead with all_in.total_minor (tax, plus tip when dining in) rather than the menu price; mention anything in all_in.excludes. Deals are community-sourced; confirm at the source before ordering."
          : `No deals found. Users can add one with prepare_deal_submission or at ${SOURCE_URL}/issues/new/choose`,
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
        const { regions } = await ctx.getDataset();
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
          endpoint: ctx.overpassUrl,
        });
        const ds = await ctx.getDataset();
        const area = resolveArea(ds, campusSlug, lat, lon);
        return json({
          attribution: OSM_ATTRIBUTION,
          count: restaurants.length,
          restaurants: area ? restaurants.map((r) => enrich(ds, r, area)) : restaurants,
          note: "Prices are all-in (tax incl., pickup). Use place_details for one restaurant, or the review_sweep prompt for reviews across platforms.",
        });
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
        "minor units (cents/fils). If tip_bps is omitted for delivery channels, the region's customary tip is used. " +
        "Always present the all-in total (food + fees + tax + tip), never just the menu price.",
      inputSchema: {
        country: z.string().length(2),
        region: z.string(),
        city: z.string().optional().describe("City slug for the local tax rate, e.g. claremont (see list_coverage)"),
        quotes: z.array(QuoteSchema).min(1).max(10),
        memberships: z
          .array(z.string())
          .optional()
          .describe("Membership ids the user has, e.g. dashpass, uber-one (defaults to saved profile)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ country, region, city, quotes, memberships }) => {
      const { regions, platforms } = await ctx.getDataset();
      const r = regions.find((x) => x.country === country && x.region === region);
      if (!r) return fail(`Unknown region ${country}/${region}. Call list_coverage.`);
      const owned = memberships ?? readProfile().memberships ?? [];
      const withTips = quotes.map((q) => ({
        ...q,
        tip_bps:
          q.tip_bps ??
          (q.channel === "pickup" || q.channel === "dine_in" ? 0 : Math.round(r.tipping.default_percent * 100)),
      }));
      const tax = taxFor(r, city);
      const result = compareChannels(withTips, r.currency, tax);
      return json({
        ...result,
        ranked: result.ranked.map((p) => ({ ...p, total_display: formatMoney(p.total, r.currency) })),
        tax_note: tax
          ? `${tax.rate_bps / 100}% tax${tax.included_in_menu_price ? " (already in menu prices)" : ""}. ${tax.note ?? ""}`.trim()
          : "Tax rate for this place is not in our data yet; totals exclude tax.",
        your_memberships: platforms
          .filter((p) => p.country === country)
          .flatMap((p) => p.memberships.map((m) => ({ platform: p.platform, ...m })))
          .filter((m) => owned.includes(m.id)),
      });
    },
  );

  if (ctx.profile) {
    const store = ctx.profile;
    server.registerTool(
      "get_profile",
      {
        title: "Read local preferences",
        description:
          "Read the user's local munchmap profile (home campus, diet, budget, memberships). Stored only on this device.",
        annotations: { readOnlyHint: true },
      },
      async () => json(store.read()),
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
      async (args) => json(store.write(Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)))),
    );
  }

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
    async (args) => json(prepareSubmission(args, { repo: ctx.repo })),
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
              "5. Then call find_deals for my campus and tell me the best options right now, combining my personal offers with public deals.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerTool(
    "place_details",
    {
      title: "Everything about one restaurant",
      description:
        "Look up one restaurant near a campus or point: munchmap deals (all-in prices), community menu prices " +
        "(all-in), student 'worth it' ratings, open-now, diet info, and links to Google Maps, Yelp, Beli, Reddit and delivery apps. " +
        "For reviews from other platforms, use the review_sweep prompt (your own web search), never invent them.",
      inputSchema: {
        name: z.string().min(2),
        campus: z.string().optional(),
        lat: z.number().min(-90).max(90).optional(),
        lon: z.number().min(-180).max(180).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      const ds = await ctx.getDataset();
      const area = resolveArea(
        ds,
        args.campus ?? (args.lat === undefined ? readProfile().home_campus : null),
        args.lat,
        args.lon,
      );
      if (!area) return fail("Provide a campus (see list_coverage) or lat/lon inside a covered city.");
      try {
        const found = await findRestaurants({
          lat: area.lat,
          lon: area.lon,
          radius_m: 3000,
          limit: 400,
          endpoint: ctx.overpassUrl,
        });
        const r = found.find(
          (x) => namesMatch(args.name, x.name) || (x.brand !== null && namesMatch(args.name, x.brand)),
        );
        if (!r)
          return fail(`Couldn't find "${args.name}" within 3 km on OpenStreetMap. Try the exact name or coordinates.`);
        const place = placeForRestaurant(r, ds.places);
        const tax = taxFor(area.region, area.city);
        const withTax = (m: number) =>
          tax && !tax.included_in_menu_price ? m + Math.round((m * tax.rate_bps) / 10_000) : m;
        return json({
          ...enrich(ds, r, area),
          menu_all_in:
            place?.menu
              .slice(0, 40)
              .map((m) => ({ item: m.name, all_in: formatMoney(withTax(m.price.amount_minor), m.price.currency) })) ??
            [],
          menu_source: place?.menu_source ?? null,
          recent_student_notes: place?.ratings.flatMap((x) => (x.note ? [x.note] : [])).slice(-5) ?? [],
          attribution: OSM_ATTRIBUTION,
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    "prepare_place_submission",
    {
      title: "Draft menu prices and/or a student rating",
      description:
        "Turn menu prices (e.g. read from a menu or receipt photo the user shared with you) and/or the user's 'worth it' rating " +
        "into a community submission. Prices as printed on the menu (pre-tax), in minor units. NEVER sends anything: returns a " +
        "prefilled GitHub issue link for the USER to review and submit. Don't include card numbers, names or order numbers.",
      inputSchema: {
        name: z.string().min(2).describe("Restaurant name"),
        campus: z.string().optional(),
        lat: z.number().min(-90).max(90).describe("Restaurant latitude (from place_details/find_restaurants)"),
        lon: z.number().min(-180).max(180),
        osm: z.string().optional().describe("OSM id like node/123 from place_details"),
        menu: z
          .array(
            z.object({ name: z.string(), price_minor: z.number().int().positive(), category: z.string().optional() }),
          )
          .max(150)
          .optional(),
        menu_source: z.enum(["website", "photo", "receipt", "in_person"]).optional(),
        menu_source_url: z.string().optional(),
        rating: z
          .object({
            worth_it: z.number().int().min(1).max(5),
            portion: z.number().int().min(1).max(5).optional(),
            student_friendly: z.number().int().min(1).max(5).optional(),
            note: z.string().max(200).optional(),
          })
          .optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const ds = await ctx.getDataset();
      const area = resolveArea(ds, args.campus, args.lat, args.lon);
      if (!area) return fail("That location isn't in a covered city yet.");
      return json(
        preparePlaceSubmission(
          {
            place: {
              name: args.name,
              country: area.region.country,
              region: area.region.region,
              city: area.city,
              lat: args.lat,
              lon: args.lon,
              osm: args.osm ?? null,
            },
            currency: area.region.currency,
            menu: args.menu,
            menu_source: args.menu_source ?? null,
            menu_source_url: args.menu_source_url ?? null,
            rating: args.rating,
          },
          { repo: ctx.repo },
        ),
      );
    },
  );

  server.registerPrompt(
    "review_sweep",
    {
      title: "Review sweep: what does everyone say about this place?",
      description:
        "Has your AI check reviews across Google Maps, Yelp, Beli, Reddit, blogs and delivery apps with its own web search, " +
        "then summarize where they agree and disagree, with links. munchmap stores none of it.",
      argsSchema: {
        restaurant: z.string().describe("Restaurant name"),
        city: z.string().describe("City, e.g. Champaign IL"),
      },
    },
    ({ restaurant, city }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Do a review sweep for "${restaurant}" in ${city}.`,
              "1. Call munchmap's place_details first for deals, all-in prices, student ratings and links.",
              "2. Use your web search to read what each source says: Google Maps, Yelp, Beli, Reddit (r/<city or campus>), food blogs/local news, TikTok/Instagram mentions, and delivery-app ratings if visible.",
              "3. Give me: a short per-source summary with its rating and number of reviews when shown, and a link to each source you actually opened.",
              "4. Call out disagreements and likely bias (e.g. Beli skews foodie, delivery-app ratings reflect delivery not food, Google has volume but noise).",
              "5. Finish with: best value orders, what to skip, the cheapest all-in way to get it (pickup vs apps), and whether students think it's worth it.",
              "Never invent reviews or ratings. If you can't open a source, say so. Don't paste long passages; summarize in your own words.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}
