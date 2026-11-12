/**
 * Map-level logic shared by the web app, MCP server and (later) bots:
 * matching deals and community data to OSM restaurants, all-in menu prices, "open now",
 * deep links to other platforms, taste-list import (e.g. a Beli export) and "for you" ranking.
 */
import OpeningHours from "opening_hours";
import { dealAllIn, taxFor } from "./allin.ts";
import { isExpired, isScheduleActive } from "./deals.ts";
import { haversineMeters, mapsSearchUrl } from "./geo.ts";
import type { Restaurant } from "./osm.ts";
import type { Deal, Place, Profile, Region } from "./schema.ts";

// ---------- names & matching ----------

/** Lowercase, strip accents/punctuation/common suffixes so "Papa Del's Pizza" ≈ "papa dels". */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|restaurant|cafe|café|kitchen|grill|bar|co|inc|llc|ltd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when one normalized name contains the other as whole words. */
export function namesMatch(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
}

export interface PlaceContext {
  country: string;
  region: string;
  city: string;
}

/** Active deals that apply to this restaurant: same brand, and valid for this place (or nationwide). */
export function dealsForRestaurant(r: Restaurant, deals: Deal[], ctx: PlaceContext, now = new Date()): Deal[] {
  return deals.filter(
    (d) =>
      !isExpired(d, now) &&
      d.country === ctx.country &&
      (d.region === "*" || d.region === ctx.region) &&
      (d.city === "*" || d.city === ctx.city) &&
      (namesMatch(d.brand, r.name) || (r.brand !== null && namesMatch(d.brand, r.brand))),
  );
}

/** Community place record for an OSM restaurant: exact OSM id, else same name within 150 m. */
export function placeForRestaurant(r: Restaurant, places: Place[]): Place | undefined {
  return (
    places.find((p) => p.osm === r.id) ?? places.find((p) => namesMatch(p.name, r.name) && haversineMeters(p, r) < 150)
  );
}

// ---------- prices & ratings ----------

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : Math.round(((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2);
};

export interface PriceSummary {
  currency: string;
  /** Cheapest item, all-in for pickup (incl. local tax). */
  min_all_in: number;
  /** Typical item, all-in for pickup. */
  median_all_in: number;
  items: number;
  tax_unknown: boolean;
}

/** All-in (pickup, incl. tax) price summary from a place's community menu. */
export function menuPriceSummary(place: Place, region: Region): PriceSummary | null {
  if (!place.menu.length) return null;
  const tax = taxFor(region, place.city);
  const withTax = (minor: number) =>
    tax && !tax.included_in_menu_price ? minor + Math.round((minor * tax.rate_bps) / 10_000) : minor;
  const prices = place.menu.map((m) => withTax(m.price.amount_minor));
  return {
    currency: place.menu[0]?.price.currency ?? region.currency,
    min_all_in: Math.min(...prices),
    median_all_in: median(prices),
    items: prices.length,
    tax_unknown: tax === null,
  };
}

export interface RatingSummary {
  count: number;
  worth_it: number; // average, 1 decimal
  portion: number | null;
  student_friendly: number | null;
}

export function ratingSummary(place: Place | undefined): RatingSummary | null {
  if (!place?.ratings.length) return null;
  const avg = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number");
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  return {
    count: place.ratings.length,
    worth_it: avg(place.ratings.map((r) => r.worth_it)) ?? 0,
    portion: avg(place.ratings.map((r) => r.portion)),
    student_friendly: avg(place.ratings.map((r) => r.student_friendly)),
  };
}

// ---------- open now ----------

/** Wall-clock time at the restaurant, as a Date whose *local* fields match (what opening_hours.js expects). */
function wallClock(now: Date, tz: string): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
}

/** Is an OSM `opening_hours` value open right now in the given timezone? null = unknown/unparseable. */
export function isOpenNow(openingHours: string | null, tz: string, now = new Date()): boolean | null {
  if (!openingHours) return null;
  try {
    // No holiday data passed: "PH" rules are ignored rather than guessed.
    const oh = new OpeningHours(openingHours, null);
    if (oh.getState(wallClock(now, tz))) return true;
    return oh.getUnknown(wallClock(now, tz)) ? null : false;
  } catch {
    return null;
  }
}

// ---------- deep links (we link out instead of copying other platforms' data) ----------

export interface PlaceLink {
  label: string;
  url: string;
}

export function placeLinks(
  r: Pick<Restaurant, "name" | "lat" | "lon">,
  cityName: string,
  platforms: string[],
): PlaceLink[] {
  const q = encodeURIComponent(`${r.name} ${cityName}`);
  const links: PlaceLink[] = [
    { label: "Google Maps", url: mapsSearchUrl(`${r.name} ${r.lat},${r.lon}`) },
    {
      label: "Yelp",
      url: `https://www.yelp.com/search?find_desc=${encodeURIComponent(r.name)}&find_loc=${encodeURIComponent(cityName)}`,
    },
    { label: "Beli", url: `https://www.google.com/search?q=${encodeURIComponent(`${r.name} ${cityName} beli`)}` },
    { label: "Reddit", url: `https://www.reddit.com/search/?q=${q}` },
  ];
  if (platforms.includes("ubereats")) links.push({ label: "Uber Eats", url: `https://www.ubereats.com/search?q=${q}` });
  if (platforms.includes("doordash"))
    links.push({ label: "DoorDash", url: `https://www.doordash.com/search/store/${encodeURIComponent(r.name)}/` });
  return links;
}

// ---------- taste lists (Beli export, Google list, or pasted names) ----------

export interface TasteEntry {
  name: string;
  /** Normalized to 0–10 when the source has a score/rating. */
  score: number | null;
  city: string | null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const toTen = (raw: number, max: number) => Math.round(Math.min(10, Math.max(0, (raw / max) * 10)) * 10) / 10;
function parseScore(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number.parseFloat(v.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n <= 5 ? toTen(n, 5) : n <= 10 ? toTen(n, 10) : n <= 100 ? toTen(n, 100) : null;
}

/**
 * Parse a list of restaurants someone likes. Accepts:
 *  - CSV with a header containing name/restaurant/place (+ optional score/rating, city) — e.g. a Beli or Google Takeout export
 *  - a JSON array of strings or objects with name/score
 *  - plain text, one per line, optionally "Name — 8.7" or "Name, 4.5"
 * Runs entirely on-device; nothing is uploaded.
 */
export function parseTasteList(text: string): TasteEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as unknown[];
      return arr.flatMap((x): TasteEntry[] => {
        if (typeof x === "string") return [{ name: x, score: null, city: null }];
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          const name = String(o.name ?? o.restaurant ?? o.title ?? "").trim();
          const score = parseScore(String(o.score ?? o.rating ?? ""));
          return name ? [{ name, score, city: o.city ? String(o.city) : null }] : [];
        }
        return [];
      });
    } catch {
      /* fall through to text parsing */
    }
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const nameCol = header.findIndex((h) => /^(name|restaurant|place|title)( name)?$/.test(h));
  if (nameCol >= 0 && lines.length > 1) {
    const scoreCol = header.findIndex((h) => /(score|rating|stars)/.test(h));
    const cityCol = header.findIndex((h) => /^(city|location)$/.test(h));
    return lines.slice(1).flatMap((l) => {
      const cells = splitCsvLine(l);
      const name = cells[nameCol]?.trim();
      return name
        ? [
            {
              name,
              score: scoreCol >= 0 ? parseScore(cells[scoreCol]) : null,
              city: cityCol >= 0 ? (cells[cityCol] ?? null) : null,
            },
          ]
        : [];
    });
  }
  return lines.map((l) => {
    const m = l.match(/^\s*(?:\d+[.)]\s*)?(.+?)(?:\s*(?:[—–\-,:|]|\t)\s*(\d+(?:[.,]\d+)?)\s*(?:\/\s*\d+)?)?\s*$/);
    return { name: (m?.[1] ?? l).trim(), score: parseScore(m?.[2]), city: null };
  });
}

// ---------- "for you" ranking ----------

export interface Candidate {
  restaurant: Restaurant;
  deals: Deal[];
  place?: Place;
}

export interface RankOptions {
  profile: Partial<Profile>;
  region: Region;
  city: string;
  tastes?: TasteEntry[];
  now?: Date;
}

export interface Ranked extends Candidate {
  score: number;
  reasons: string[];
  /** Cheapest known all-in price (deal or menu), minor units. */
  cheapest_all_in: number | null;
}

/**
 * Transparent, explainable scoring (no black box): every point comes with a human reason.
 * Signals: liked in your taste list, favourite cuisine, live deals, within budget,
 * student "worth it" rating, diet fit, distance.
 */
export function rankForYou(candidates: Candidate[], opts: RankOptions): Ranked[] {
  const { profile, region, city } = opts;
  const now = opts.now ?? new Date();
  const fav = (profile.favorite_cuisines ?? []).map((c) => c.toLowerCase());
  const avoid = (profile.avoid ?? []).map((c) => c.toLowerCase());
  const diet = (profile.diet ?? []).map((d) => d.toLowerCase());
  const budget = profile.budget_per_meal?.amount_minor ?? null;

  return candidates
    .map((c): Ranked => {
      const r = c.restaurant;
      const reasons: string[] = [];
      let score = 0;
      const cuisines = (r.cuisine ?? "")
        .toLowerCase()
        .split(/[;,]/)
        .map((x) => x.trim())
        .filter(Boolean);

      const liked = opts.tastes?.find((t) => namesMatch(t.name, r.name));
      if (liked) {
        const pts = liked.score !== null ? liked.score * 0.8 : 5;
        score += pts;
        reasons.push(liked.score !== null ? `On your list (${liked.score}/10)` : "On your list");
      }
      if (cuisines.some((x) => fav.includes(x))) {
        score += 4;
        reasons.push(`You like ${cuisines.find((x) => fav.includes(x))}`);
      }
      if (cuisines.some((x) => avoid.includes(x))) score -= 8;

      const live = c.deals.filter((d) => isScheduleActive(d.schedule, now));
      if (live.length) {
        score += 5;
        reasons.push(live.length > 1 ? `${live.length} deals on now` : "Deal on now");
      } else if (c.deals.length) {
        score += 2;
        reasons.push("Has deals");
      }
      if (c.deals.some((d) => d.student_only)) {
        score += 1;
        reasons.push("Student discount");
      }

      const dealPrices = c.deals.map((d) => dealAllIn(d, region, city)?.total_minor).filter((x): x is number => !!x);
      const menu = c.place ? menuPriceSummary(c.place, region) : null;
      const cheapest = Math.min(...dealPrices, menu?.min_all_in ?? Number.POSITIVE_INFINITY);
      const cheapest_all_in = Number.isFinite(cheapest) ? cheapest : null;
      if (budget !== null && cheapest_all_in !== null) {
        if (cheapest_all_in <= budget) {
          score += 3;
          reasons.push("Within your budget");
        } else score -= 2;
      }

      const rating = ratingSummary(c.place);
      if (rating) {
        score += (rating.worth_it - 3) * 1.5;
        if (rating.worth_it >= 4) reasons.push(`Students say worth it (${rating.worth_it}/5)`);
      }

      const dietOk: Record<string, boolean> = {
        vegetarian: r.diet.vegetarian,
        vegan: r.diet.vegan,
        halal: r.diet.halal,
        gluten_free: r.diet.gluten_free,
      };
      for (const d of diet) {
        if (dietOk[d]) {
          score += 2;
          reasons.push(`${d.replace("_", "-")} options`);
        } else if (d in dietOk) score -= 1;
      }

      score -= Math.min(4, r.distance_m / 500); // ~1 point per 500 m, capped
      return { ...c, score: Math.round(score * 10) / 10, reasons, cheapest_all_in };
    })
    .sort((a, b) => b.score - a.score);
}
