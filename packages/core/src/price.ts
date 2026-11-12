import type { Currency } from "./schema.ts";

/**
 * A quote for one way of getting the same order (e.g. "pickup", "ubereats", "first_party_site").
 * All amounts are integer minor units in one currency. Percentages are basis points (1% = 100 bps).
 * Quotes usually come from the USER (what they see in their own app) or from the platform KB.
 */
export interface ChannelQuote {
  channel: string;
  /** Menu subtotal on this channel (delivery apps often mark menu prices up). */
  subtotal_minor: number;
  delivery_fee_minor?: number;
  service_fee_minor?: number;
  service_fee_bps?: number;
  small_order_fee_minor?: number;
  /** Discount from a promo/deal, already known in minor units. */
  promo_minor?: number;
  /** True if the user has a membership that waives delivery fee on this channel. */
  membership_free_delivery?: boolean;
  /** Tip expected for this channel (bps of subtotal). Pickup usually 0. */
  tip_bps?: number;
}

export interface TaxRule {
  rate_bps: number;
  included_in_menu_price: boolean;
}

export interface PriceBreakdown {
  channel: string;
  currency: Currency;
  subtotal: number;
  fees: number;
  promo: number;
  tax: number;
  tip: number;
  total: number;
  /** True when tax couldn't be computed (unknown rate), so `total` excludes tax. */
  tax_unknown: boolean;
}

/** Round half away from zero for non-negative values, as integer minor units. */
const bps = (amount: number, rate: number) => Math.round((amount * rate) / 10_000);

export function effectivePrice(q: ChannelQuote, currency: Currency, tax: TaxRule | null): PriceBreakdown {
  const subtotal = q.subtotal_minor;
  const delivery = q.membership_free_delivery ? 0 : (q.delivery_fee_minor ?? 0);
  const service = (q.service_fee_minor ?? 0) + bps(subtotal, q.service_fee_bps ?? 0);
  const fees = delivery + service + (q.small_order_fee_minor ?? 0);
  const promo = Math.min(q.promo_minor ?? 0, subtotal);
  // Simplification: tax applies to discounted subtotal + fees. Real rules vary by jurisdiction
  // (see LESSONS.md / region.yaml notes); the result is labeled an estimate everywhere it is shown.
  const taxable = subtotal - promo + fees;
  const taxAmt = tax && !tax.included_in_menu_price ? bps(taxable, tax.rate_bps) : 0;
  const tip = bps(subtotal, q.tip_bps ?? 0);
  return {
    channel: q.channel,
    currency,
    subtotal,
    fees,
    promo,
    tax: taxAmt,
    tip,
    total: subtotal - promo + fees + taxAmt + tip,
    tax_unknown: tax === null,
  };
}

/** Rank channels cheapest-first and report savings vs the most expensive option. */
export function compareChannels(quotes: ChannelQuote[], currency: Currency, tax: TaxRule | null) {
  const ranked = quotes.map((q) => effectivePrice(q, currency, tax)).sort((a, b) => a.total - b.total);
  const cheapest = ranked[0];
  const priciest = ranked[ranked.length - 1];
  return {
    ranked,
    cheapest: cheapest?.channel ?? null,
    savings_vs_priciest_minor: cheapest && priciest ? priciest.total - cheapest.total : 0,
  };
}

export function formatMoney(amountMinor: number, currency: Currency, locale = "en"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}
