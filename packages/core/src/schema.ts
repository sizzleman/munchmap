import { z } from "zod";

/** ISO date (YYYY-MM-DD). YAML may parse unquoted dates as Date objects, so accept both. */
export const IsoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
);

export const Currency = z.enum(["USD", "CAD", "AED"]);
export type Currency = z.infer<typeof Currency>;

/** Money is always integer minor units (cents / fils) + ISO 4217 code. Never floats. */
export const Money = z.object({
  amount_minor: z.number().int().nonnegative(),
  currency: Currency,
});
export type Money = z.infer<typeof Money>;

export const Channel = z.enum([
  "pickup",
  "delivery",
  "dine_in",
  "first_party_site",
  "first_party_app",
  "doordash",
  "ubereats",
  "skip",
  "grubhub",
  "talabat",
  "deliveroo",
  "careem",
  "noon",
  "keeta",
  "tgtg",
  "other",
]);
export type Channel = z.infer<typeof Channel>;

export const DealType = z.enum([
  "percent_off",
  "amount_off",
  "fixed_price",
  "bogo",
  "free_item",
  "free_delivery",
  "membership_perk",
  "loyalty",
  "surplus",
]);

export const Weekday = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export type Weekday = z.infer<typeof Weekday>;

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM (24h)");

export const Schedule = z.object({
  days: z.array(Weekday).min(1),
  start: HHMM.nullable().optional(),
  end: HHMM.nullable().optional(),
  tz: z.string().min(1),
});
export type Schedule = z.infer<typeof Schedule>;

export const DealValue = z.union([Money, z.object({ percent: z.number().positive().max(100) })]);

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "expected lowercase kebab-case");
const regionCode = z.union([z.string().regex(/^[A-Z0-9]{1,3}$/), z.literal("*")]);

export const Deal = z.object({
  id: slug,
  title: z.string().min(3).max(140),
  brand: z.string().min(1),
  country: z.string().regex(/^[A-Z]{2}$/),
  region: regionCode,
  city: z.union([slug, z.literal("*")]),
  campuses: z.array(slug).default([]),
  channels: z.array(Channel).min(1),
  type: DealType,
  value: DealValue.nullable(),
  schedule: Schedule.nullable(),
  conditions: z.string().nullable(),
  student_only: z.boolean(),
  promo_code: z.string().nullable(),
  source_url: z.url(),
  verified_at: IsoDate,
  expires: IsoDate.nullable(),
  submitted_by: z.string().min(1),
});
export type Deal = z.infer<typeof Deal>;

export const SourcedRate = z.object({
  rate_bps: z.number().int().min(0).max(5000),
  included_in_menu_price: z.boolean(),
  /** Whether delivery/service fees are taxed too. Rules vary; default true gives a conservative (higher) estimate. */
  fees_taxable: z.boolean().default(true),
  note: z.string().nullable().optional(),
  source_url: z.url(),
  verified_at: IsoDate,
});

export const Region = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  region: z.string().regex(/^[A-Z0-9]{1,3}$/),
  name: z.string(),
  currency: Currency,
  timezone: z.string(),
  /** null = not yet verified; the engine then shows prices pre-tax and says so. */
  tax: SourcedRate.nullable(),
  tipping: z.object({ customary: z.boolean(), default_percent: z.number().min(0).max(30) }),
  platforms: z.array(Channel),
  cities: z.array(
    z.object({
      slug,
      name: z.string(),
      lat: z.number(),
      lon: z.number(),
      /** City-level rate on prepared food when it differs from the region's (common in the US). */
      tax: SourcedRate.nullable().optional(),
    }),
  ),
  campuses: z.array(
    z.object({
      slug,
      name: z.string(),
      city: slug,
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    }),
  ),
});
export type Region = z.infer<typeof Region>;
export type SourcedRate = z.infer<typeof SourcedRate>;

export const Membership = z.object({
  id: slug,
  name: z.string(),
  price: Money.nullable(),
  period: z.enum(["month", "year"]),
  student_price: Money.nullable(),
  free_delivery_min_subtotal: Money.nullable(),
  service_fee_reduced: z.boolean().nullable(),
  perks: z.array(z.string()),
  source_url: z.url(),
  verified_at: IsoDate,
});
export type Membership = z.infer<typeof Membership>;

export const Platform = z.object({
  id: slug,
  platform: Channel,
  country: z.string().regex(/^[A-Z]{2}$/),
  name: z.string(),
  website: z.url().nullable(),
  memberships: z.array(Membership),
  fees_note: z.string().nullable(),
  source_url: z.url(),
  verified_at: IsoDate,
});
export type Platform = z.infer<typeof Platform>;

/** Local-only user profile. Never uploaded anywhere. */
export const Profile = z.object({
  home_campus: slug.nullable().default(null),
  diet: z.array(z.string()).default([]),
  favorite_cuisines: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  budget_per_meal: Money.nullable().default(null),
  memberships: z.array(z.string()).default([]),
  loyalty_programs: z.array(z.string()).default([]),
  prefers: z.enum(["pickup", "delivery", "any"]).default("any"),
});
export type Profile = z.infer<typeof Profile>;
