/**
 * Turn a deal the user found (email, notification, post, screenshot) into a public submission
 * WITHOUT sending anything: we scrub personal data, validate, and return a prefilled GitHub
 * issue link the user opens and submits themselves. The user stays in control.
 */

import { stringify } from "yaml";
import { cleanUrl, looksLikePromptInjection, looksPersonalCode, scrubText } from "./privacy.ts";
import { Deal, Place } from "./schema.ts";

export const DEFAULT_REPO = "sizzleman/munchmap";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export interface DraftInput {
  title: string;
  brand: string;
  country: string;
  region: string;
  city: string;
  campuses?: string[];
  channels: string[];
  type: string;
  value?: { amount_minor: number; currency: string } | { percent: number } | null;
  schedule?: { days: string[]; start?: string | null; end?: string | null; tz: string } | null;
  conditions?: string | null;
  student_only?: boolean;
  promo_code?: string | null;
  source_url: string;
  expires?: string | null;
}

export interface DraftResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
  yaml?: string;
  issue_url?: string;
}

export function prepareSubmission(input: DraftInput, opts: { today?: Date; repo?: string } = {}): DraftResult {
  const today = opts.today ?? new Date();
  const repo = opts.repo ?? DEFAULT_REPO;
  const warnings: string[] = [];
  const title = scrubText(input.title);
  const conditions = input.conditions ? scrubText(input.conditions) : null;
  const removed = [...title.removed, ...(conditions?.removed ?? [])];
  if (removed.length) warnings.push(`Removed personal info: ${[...new Set(removed)].join(", ")}`);

  if (looksLikePromptInjection(`${input.title} ${input.brand} ${input.conditions ?? ""}`))
    return {
      ok: false,
      warnings,
      errors: ["Text contains instructions aimed at AI assistants; please describe only the deal."],
    };

  const source = cleanUrl(input.source_url);
  if (!source)
    return {
      ok: false,
      warnings,
      errors: [
        "source_url is missing, invalid, or an email click-tracking link that may identify you. Open the link in a browser and use the final public page URL instead.",
      ],
    };
  if (source !== input.source_url) warnings.push("Removed tracking parameters from source_url.");

  let promo = input.promo_code ?? null;
  if (promo && looksPersonalCode(promo)) {
    warnings.push(`Promo code "${promo}" looks personal/single-use and was NOT included. Only share public codes.`);
    promo = null;
  }

  const region = input.region === "*" ? "national" : input.region.toLowerCase();
  const city = input.city === "*" ? "" : `-${input.city}`;
  const id = `${input.country.toLowerCase()}-${region}${city}-${slugify(input.brand)}-${slugify(title.text)}`.replace(
    /-+/g,
    "-",
  );

  const candidate = {
    id,
    title: title.text,
    brand: input.brand,
    country: input.country,
    region: input.region,
    city: input.city,
    campuses: input.campuses ?? [],
    channels: input.channels,
    type: input.type,
    value: input.value ?? null,
    schedule: input.schedule ?? null,
    conditions: conditions?.text ?? null,
    student_only: input.student_only ?? false,
    promo_code: promo,
    source_url: source,
    verified_at: today.toISOString().slice(0, 10),
    expires: input.expires ?? null,
    submitted_by: "community",
  };
  const parsed = Deal.safeParse(candidate);
  if (!parsed.success)
    return { ok: false, warnings, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };

  const yaml = stringify(parsed.data);
  const body = `<!-- Submitted via munchmap. Review before submitting: make sure nothing personal is included. -->\n\n\`\`\`yaml\n${yaml}\`\`\`\n`;
  const issue_url = `https://github.com/${repo}/issues/new?${new URLSearchParams({
    title: `[deal] ${parsed.data.brand}: ${parsed.data.title}`.slice(0, 120),
    labels: "new-deal",
    body,
  })}`;
  return { ok: true, warnings, errors: [], yaml, issue_url };
}

// ---------- menus & ratings for a place ----------

export interface PlaceSubmissionInput {
  place: { name: string; country: string; region: string; city: string; lat: number; lon: number; osm?: string | null };
  menu?: { name: string; price_minor: number; category?: string | null }[];
  menu_source?: "website" | "photo" | "receipt" | "in_person" | null;
  menu_source_url?: string | null;
  rating?: { worth_it: number; portion?: number | null; student_friendly?: number | null; note?: string | null };
  currency: "USD" | "CAD" | "AED";
}

/** Stable id for a place: osm-backed when possible, else rounded coordinates. */
export function placeId(p: PlaceSubmissionInput["place"]): string {
  const tail = p.osm ? p.osm.replace("/", "-") : `${Math.round(p.lat * 1e4)}-${Math.round(Math.abs(p.lon) * 1e4)}`;
  return `${p.country}-${p.region}-${p.city}-${slugify(p.name)}-${tail}`.toLowerCase().replace(/-+/g, "-");
}

/**
 * Draft a menu-price and/or rating submission for one place (same privacy rules as deals):
 * scrubs personal info, sanity-checks prices, and returns YAML + a prefilled GitHub issue link.
 * Sends nothing.
 */
export function preparePlaceSubmission(
  input: PlaceSubmissionInput,
  opts: { today?: Date; repo?: string } = {},
): DraftResult {
  const today = (opts.today ?? new Date()).toISOString().slice(0, 10);
  const repo = opts.repo ?? DEFAULT_REPO;
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!input.menu?.length && !input.rating) errors.push("Add menu prices, a rating, or both.");

  const menu = (input.menu ?? []).flatMap((m) => {
    const name = scrubText(m.name).text.trim();
    if (!name || !Number.isInteger(m.price_minor) || m.price_minor <= 0) return [];
    if (m.price_minor > 50_000) {
      warnings.push(`Skipped "${name}": price looks wrong.`);
      return [];
    }
    return [{ name, price: { amount_minor: m.price_minor, currency: input.currency }, category: m.category ?? null }];
  });
  const sourceUrl = input.menu_source_url ? cleanUrl(input.menu_source_url) : null;
  if (input.menu_source_url && !sourceUrl) errors.push("Menu link must be a clean public URL (not an email link).");

  let rating: Record<string, unknown> | undefined;
  if (input.rating) {
    const note = input.rating.note ? scrubText(input.rating.note) : null;
    if (note?.removed.length) warnings.push(`Removed personal info from your note: ${note.removed.join(", ")}`);
    if (note && looksLikePromptInjection(note.text)) errors.push("Note contains instructions aimed at AI assistants.");
    rating = {
      worth_it: input.rating.worth_it,
      portion: input.rating.portion ?? null,
      student_friendly: input.rating.student_friendly ?? null,
      note: note?.text.slice(0, 200) ?? null,
      date: today,
      submitted_by: "community",
    };
  }
  if (looksLikePromptInjection(menu.map((m) => m.name).join(" ")))
    errors.push("Menu text contains instructions aimed at AI assistants.");

  const doc = {
    kind: "place",
    place: { ...input.place, id: placeId(input.place), osm: input.place.osm ?? null },
    ...(menu.length
      ? {
          menu,
          menu_source: input.menu_source ?? (sourceUrl ? "website" : "photo"),
          menu_source_url: sourceUrl,
          menu_verified_at: today,
        }
      : {}),
    ...(rating ? { rating } : {}),
  };
  // Validate the pieces against the real schemas before handing anything back.
  const check = Place.safeParse({
    ...doc.place,
    menu,
    ratings: rating ? [rating] : [],
    menu_source: "menu_source" in doc ? doc.menu_source : null,
    menu_source_url: sourceUrl,
  });
  if (!check.success) errors.push(...check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  if (errors.length) return { ok: false, warnings, errors };

  const yaml = stringify(doc);
  const what = [menu.length ? `${menu.length} menu prices` : "", rating ? "rating" : ""].filter(Boolean).join(" + ");
  const body = `<!-- Submitted via munchmap. If prices came from a photo, drag the photo into this issue so a maintainer can check it. -->\n\n\`\`\`yaml\n${yaml}\`\`\`\n`;
  const issue_url = `https://github.com/${repo}/issues/new?${new URLSearchParams({
    title: `[place] ${input.place.name}: ${what}`.slice(0, 120),
    labels: "new-deal",
    body,
  })}`;
  if (issue_url.length > 7500)
    warnings.push("This is a long submission. If the GitHub link doesn't open, copy the YAML into a new issue.");
  return { ok: true, warnings, errors, yaml, issue_url };
}
