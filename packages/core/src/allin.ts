/**
 * "All-in" prices: what you actually pay, not the menu sticker price.
 * North American menus usually exclude tax, and apps add fees on top. munchmap always shows
 * the out-the-door estimate first and the breakdown second.
 */
import type { TaxRule } from "./price.ts";
import type { Currency, Deal, Region } from "./schema.ts";

/** Prepared-food tax for a place: the city's rate if we have one, else the region's, else null (unknown). */
export function taxFor(
  region: Region,
  citySlug?: string,
): (TaxRule & { note?: string | null; source_url?: string }) | null {
  const city = citySlug ? region.cities.find((c) => c.slug === citySlug) : undefined;
  return city?.tax ?? region.tax ?? null;
}

export interface AllInEstimate {
  currency: Currency;
  /** How the estimate assumes you get the food. */
  basis: "pickup" | "dine_in" | "delivery";
  menu_minor: number;
  tax_minor: number;
  tip_minor: number;
  total_minor: number;
  /** Tax rate unknown for this place → total excludes tax. */
  tax_unknown: boolean;
  /** Costs we can't know in advance and that are NOT in total_minor. */
  excludes: string[];
}

const PICKUP_LIKE = new Set(["pickup", "first_party_site", "first_party_app", "tgtg", "other"]);
const bps = (amount: number, rate: number) => Math.round((amount * rate) / 10_000);

/**
 * Out-the-door estimate for a fixed-price deal in a given place.
 * Picks the cheapest way to get it: pickup (no tip) → dine-in (customary tip) → delivery (fees vary).
 * Returns null when the deal has no fixed price (e.g. "15% off").
 */
export function dealAllIn(deal: Deal, region: Region, citySlug?: string): AllInEstimate | null {
  if (!deal.value || !("amount_minor" in deal.value) || deal.type !== "fixed_price") return null;
  const menu = deal.value.amount_minor;
  const tax = taxFor(region, citySlug);
  const basis: AllInEstimate["basis"] = deal.channels.some((c) => PICKUP_LIKE.has(c))
    ? "pickup"
    : deal.channels.includes("dine_in")
      ? "dine_in"
      : "delivery";
  const taxAmt = tax && !tax.included_in_menu_price ? bps(menu, tax.rate_bps) : 0;
  const tip = basis === "dine_in" && region.tipping.customary ? bps(menu, region.tipping.default_percent * 100) : 0;
  const excludes: string[] = [];
  if (basis === "delivery") excludes.push("delivery & service fees (vary by app; use Compare)");
  if (!tax) excludes.push("tax (rate not in our data yet)");
  return {
    currency: deal.value.currency,
    basis,
    menu_minor: menu,
    tax_minor: taxAmt,
    tip_minor: tip,
    total_minor: menu + taxAmt + tip,
    tax_unknown: tax === null,
    excludes,
  };
}
