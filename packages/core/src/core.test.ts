import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanUrl,
  compareChannels,
  dealAllIn,
  effectivePrice,
  findDeals,
  isScheduleActive,
  looksPersonalCode,
  scrubText,
  taxFor,
} from "./index.ts";
import { loadDataDir } from "./node.ts";

const fixtures = loadDataDir(join(import.meta.dirname, "__fixtures__", "data"));

describe("loadDataDir", () => {
  it("loads fixtures without issues", () => {
    expect(fixtures.issues).toEqual([]);
    expect(fixtures.deals).toHaveLength(2);
    expect(fixtures.regions).toHaveLength(1);
  });
});

describe("isScheduleActive", () => {
  const tue = { days: ["tue" as const], start: "11:00", end: "23:00", tz: "America/Chicago" };
  it("is active inside the window (local time)", () => {
    // 2026-11-10 is a Tuesday; 18:00 UTC = 12:00 CST
    expect(isScheduleActive(tue, new Date("2026-11-10T18:00:00Z"))).toBe(true);
  });
  it("is inactive outside the window", () => {
    expect(isScheduleActive(tue, new Date("2026-11-10T16:00:00Z"))).toBe(false); // 10:00 local
    expect(isScheduleActive(tue, new Date("2026-11-11T18:00:00Z"))).toBe(false); // Wednesday
  });
  it("handles overnight windows", () => {
    const late = { days: ["fri" as const], start: "22:00", end: "02:00", tz: "America/Chicago" };
    expect(isScheduleActive(late, new Date("2026-11-14T07:00:00Z"))).toBe(true); // Sat 01:00 local
    expect(isScheduleActive(late, new Date("2026-11-14T09:00:00Z"))).toBe(false); // Sat 03:00 local
  });
  it("null schedule is always active", () => {
    expect(isScheduleActive(null, new Date())).toBe(true);
  });
});

describe("findDeals", () => {
  const now = new Date("2026-11-10T18:00:00Z");
  it("campus query includes national deals, campus-specific first", () => {
    const r = findDeals(fixtures.deals, fixtures.regions, { campus: "test-u", now });
    expect(r.map((d) => d.id)).toEqual(["us-il-champaign-example-pizza-tuesday", "us-national-example-burger-student"]);
  });
  it("filters by mode and student", () => {
    expect(findDeals(fixtures.deals, fixtures.regions, { campus: "test-u", mode: "delivery", now })).toHaveLength(1);
    expect(findDeals(fixtures.deals, fixtures.regions, { campus: "test-u", studentOnly: true, now })).toHaveLength(1);
  });
  it("drops expired deals", () => {
    const later = new Date("2027-01-05T18:00:00Z");
    expect(findDeals(fixtures.deals, fixtures.regions, { campus: "test-u", now: later }).map((d) => d.id)).toEqual([
      "us-il-champaign-example-pizza-tuesday",
    ]);
  });
  it("text query matches brand", () => {
    expect(findDeals(fixtures.deals, fixtures.regions, { query: "burger", now })).toHaveLength(1);
  });
});

describe("effectivePrice / compareChannels", () => {
  const on = { rate_bps: 1300, included_in_menu_price: false };
  it("pickup vs delivery in Ontario", () => {
    const res = compareChannels(
      [
        { channel: "pickup", subtotal_minor: 2000 },
        { channel: "ubereats", subtotal_minor: 2400, delivery_fee_minor: 299, service_fee_bps: 1500, tip_bps: 1500 },
      ],
      "CAD",
      on,
    );
    expect(res.cheapest).toBe("pickup");
    expect(res.ranked[0]?.total).toBe(2260); // 2000 + 13%
    // ubereats: fees 299+360=659; tax 13% of 3059=398; tip 360 → 2400+659+398+360
    expect(res.ranked[1]?.total).toBe(3817);
    expect(res.savings_vs_priciest_minor).toBe(1557);
  });
  it("membership waives delivery fee; tax-inclusive regions add no tax", () => {
    const p = effectivePrice(
      { channel: "talabat", subtotal_minor: 3000, delivery_fee_minor: 500, membership_free_delivery: true },
      "AED",
      { rate_bps: 500, included_in_menu_price: true },
    );
    expect(p.total).toBe(3000);
  });
  it("flags unknown tax", () => {
    expect(effectivePrice({ channel: "pickup", subtotal_minor: 1000 }, "USD", null).tax_unknown).toBe(true);
  });
  it("promo cannot exceed subtotal", () => {
    expect(effectivePrice({ channel: "pickup", subtotal_minor: 500, promo_minor: 900 }, "USD", null).total).toBe(0);
  });
});

describe("privacy", () => {
  it("scrubs emails, phones and order numbers", () => {
    const r = scrubText("Hi sam@example.com, order #A1B2C3D4 ready. Call 416-555-0199. 2-for-1 pizza Tuesdays!");
    expect(r.text).not.toMatch(/example\.com|A1B2C3D4|555/);
    expect(r.text).toContain("2-for-1 pizza Tuesdays!");
    expect(r.removed).toEqual(expect.arrayContaining(["email", "phone", "order number"]));
  });
  it("cleans tracking params and refuses click-tracking redirects", () => {
    expect(cleanUrl("https://pizza.example/deals?utm_source=email&uid=123&item=large")).toBe(
      "https://pizza.example/deals?item=large",
    );
    expect(cleanUrl("https://click.mailer.example/abc?u=me")).toBeNull();
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
  });
  it("detects personal promo codes", () => {
    expect(looksPersonalCode("STUDENT10")).toBe(false);
    expect(looksPersonalCode("PIZZA")).toBe(false);
    expect(looksPersonalCode("X7KQ9P2M4")).toBe(true);
    expect(looksPersonalCode("WELCOME-8F3A9C2D1E")).toBe(true);
  });
});

describe("privacy regressions", () => {
  it("strips Salesforce Marketing Cloud (sfmc_) email tracking params", () => {
    expect(cleanUrl("https://brand.example/terms?sfmc_id=1&sfmc_journey_id=abc")).toBe("https://brand.example/terms");
  });
});

describe("all-in prices", () => {
  const region = fixtures.regions[0];
  if (!region) throw new Error("fixture region missing");
  const withCityTax = {
    ...region,
    cities: region.cities.map((c) => ({
      ...c,
      tax: {
        rate_bps: 1000,
        included_in_menu_price: false,
        fees_taxable: true,
        source_url: "https://example.com/tax",
        verified_at: "2026-11-12",
      },
    })),
  };
  const pizza = fixtures.deals.find((d) => d.id === "us-il-champaign-example-pizza-tuesday");
  if (!pizza) throw new Error("fixture deal missing");

  it("city tax overrides region tax", () => {
    expect(taxFor(withCityTax, "champaign")?.rate_bps).toBe(1000);
    expect(taxFor(region, "champaign")).toBeNull();
  });
  it("pickup deal = menu + tax, no tip", () => {
    const a = dealAllIn(pizza, withCityTax, "champaign");
    expect(a).toMatchObject({ basis: "pickup", menu_minor: 799, tax_minor: 80, tip_minor: 0, total_minor: 879 });
    expect(a?.excludes).toEqual([]);
  });
  it("dine-in-only deal adds the customary tip", () => {
    const a = dealAllIn({ ...pizza, channels: ["dine_in"] }, withCityTax, "champaign");
    expect(a).toMatchObject({ basis: "dine_in", tax_minor: 80, tip_minor: 120, total_minor: 999 });
  });
  it("delivery-only deal says fees are not included", () => {
    const a = dealAllIn({ ...pizza, channels: ["doordash"] }, withCityTax, "champaign");
    expect(a?.basis).toBe("delivery");
    expect(a?.excludes[0]).toMatch(/fees/);
  });
  it("unknown tax is flagged, percent deals have no all-in price", () => {
    expect(dealAllIn(pizza, region, "champaign")?.tax_unknown).toBe(true);
    const student = fixtures.deals.find((d) => d.type === "percent_off");
    expect(student && dealAllIn(student, region)).toBeNull();
  });
  it("fees aren't taxed where fees_taxable is false", () => {
    const p = effectivePrice({ channel: "x", subtotal_minor: 1000, delivery_fee_minor: 500 }, "USD", {
      rate_bps: 1000,
      included_in_menu_price: false,
      fees_taxable: false,
    });
    expect(p.tax).toBe(100);
    expect(p.total).toBe(1600);
  });
});
