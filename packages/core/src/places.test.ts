import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dealsForRestaurant,
  isOpenNow,
  menuPriceSummary,
  namesMatch,
  parseTasteList,
  placeForRestaurant,
  placeLinks,
  type Restaurant,
  rankForYou,
  ratingSummary,
} from "./index.ts";
import { loadDataDir } from "./node.ts";

const ds = loadDataDir(join(import.meta.dirname, "__fixtures__", "data"));
const region = ds.regions[0];
if (!region) throw new Error("fixture region missing");
const regionTaxed = {
  ...region,
  cities: region.cities.map((c) => ({
    ...c,
    tax: {
      rate_bps: 1000,
      included_in_menu_price: false,
      fees_taxable: true,
      source_url: "https://example.com",
      verified_at: "2026-11-12",
    },
  })),
};
const ctx = { country: "US", region: "IL", city: "champaign" };

const restaurant = (over: Partial<Restaurant> = {}): Restaurant => ({
  id: "node/111",
  name: "Example Pizza",
  brand: null,
  lat: 40.1101,
  lon: -88.2301,
  kind: "restaurant",
  cuisine: "pizza",
  distance_m: 400,
  opening_hours: null,
  website: null,
  takeaway: null,
  delivery: null,
  diet: { vegetarian: true, vegan: false, halal: false, gluten_free: false },
  maps_url: "",
  osm_url: "",
  ...over,
});

describe("places: loading & matching", () => {
  it("loads place files", () => {
    expect(ds.issues).toEqual([]);
    expect(ds.places).toHaveLength(1);
  });
  it("matches names loosely but not too loosely", () => {
    expect(namesMatch("Papa Del's", "Papa Dels Pizza")).toBe(true);
    expect(namesMatch("Chipotle", "Chipotle Mexican Grill")).toBe(true);
    expect(namesMatch("Sub", "Subway")).toBe(false);
  });
  it("finds deals for a restaurant incl. nationwide chain deals", () => {
    const deals = dealsForRestaurant(restaurant(), ds.deals, ctx, new Date("2026-11-10T18:00:00Z"));
    expect(deals.map((d) => d.id)).toEqual(["us-il-champaign-example-pizza-tuesday"]);
    const burger = dealsForRestaurant(restaurant({ name: "Example Burger" }), ds.deals, ctx, new Date("2026-11-10"));
    expect(burger.map((d) => d.id)).toEqual(["us-national-example-burger-student"]);
  });
  it("matches community place by osm id, or by name nearby", () => {
    expect(placeForRestaurant(restaurant(), ds.places)?.id).toBe("us-il-champaign-example-pizza-green-st");
    expect(placeForRestaurant(restaurant({ id: "node/999", lat: 40.1102 }), ds.places)).toBeDefined();
    expect(placeForRestaurant(restaurant({ id: "node/999", lat: 40.2 }), ds.places)).toBeUndefined();
  });
});

describe("places: prices, ratings, hours, links", () => {
  const place = ds.places[0];
  if (!place) throw new Error("fixture place missing");
  it("menu summary is all-in (pickup incl. tax)", () => {
    expect(menuPriceSummary(place, regionTaxed)).toMatchObject({ min_all_in: 385, median_all_in: 660, items: 3 });
    expect(menuPriceSummary(place, region)?.tax_unknown).toBe(true);
  });
  it("averages student ratings", () => {
    expect(ratingSummary(place)).toMatchObject({ count: 2, worth_it: 4.5, portion: 4 });
  });
  it("evaluates OSM opening_hours in the restaurant's timezone", () => {
    const tue18utc = new Date("2026-11-10T18:00:00Z"); // 12:00 in Chicago
    expect(isOpenNow("Mo-Fr 11:00-22:00", "America/Chicago", tue18utc)).toBe(true);
    expect(isOpenNow("Mo-Fr 13:00-22:00", "America/Chicago", tue18utc)).toBe(false);
    expect(isOpenNow("not a schedule ???", "America/Chicago", tue18utc)).toBeNull();
    expect(isOpenNow(null, "America/Chicago")).toBeNull();
  });
  it("builds deep links (link out, never copy)", () => {
    const labels = placeLinks(restaurant(), "Champaign", ["doordash", "ubereats"]).map((l) => l.label);
    expect(labels).toEqual(["Google Maps", "Yelp", "Beli", "Reddit", "Uber Eats", "DoorDash"]);
  });
});

describe("taste lists", () => {
  it("parses CSV exports with scores on any scale", () => {
    const csv = 'Name,City,Score\n"Joe\'s, Pizza",Champaign,8.4\nTaco Spot,Champaign,4.5';
    expect(parseTasteList(csv)).toEqual([
      { name: "Joe's, Pizza", city: "Champaign", score: 8.4 },
      { name: "Taco Spot", city: "Champaign", score: 9 },
    ]);
  });
  it("parses pasted lines and JSON", () => {
    expect(parseTasteList("1. Example Pizza — 9.1\nNoodle Bar")).toEqual([
      { name: "Example Pizza", score: 9.1, city: null },
      { name: "Noodle Bar", score: null, city: null },
    ]);
    expect(parseTasteList('[{"name":"A","rating":5}, "B"]')).toEqual([
      { name: "A", score: 10, city: null },
      { name: "B", score: null, city: null },
    ]);
  });
});

describe("for-you ranking", () => {
  it("explains its scores and puts liked, cheap, well-rated places first", () => {
    const now = new Date("2026-11-10T18:00:00Z");
    const pizza = restaurant();
    const far = restaurant({ id: "node/2", name: "Far Sushi", cuisine: "sushi", distance_m: 2500 });
    const ranked = rankForYou(
      [
        { restaurant: far, deals: [] },
        {
          restaurant: pizza,
          deals: dealsForRestaurant(pizza, ds.deals, ctx, now),
          place: placeForRestaurant(pizza, ds.places),
        },
      ],
      {
        profile: {
          favorite_cuisines: ["pizza"],
          budget_per_meal: { amount_minor: 1200, currency: "USD" },
          diet: ["vegetarian"],
        },
        region: regionTaxed,
        city: "champaign",
        tastes: [{ name: "Example Pizza", score: 9, city: null }],
        now,
      },
    );
    expect(ranked[0]?.restaurant.name).toBe("Example Pizza");
    expect(ranked[0]?.reasons).toEqual(
      expect.arrayContaining(["On your list (9/10)", "You like pizza", "Deal on now", "Within your budget"]),
    );
    expect(ranked[0]?.cheapest_all_in).toBe(385);
  });
});
