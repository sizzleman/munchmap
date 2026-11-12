import type { Channel, Deal, Region, Schedule, Weekday } from "./schema.ts";

const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Weekday and minutes-since-midnight for `now` in the given IANA timezone. */
export function localTime(now: Date, tz: string): { day: Weekday; minutes: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday").toLowerCase().slice(0, 3) as Weekday;
  return {
    day: WEEKDAYS.includes(day) ? day : "mon",
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Is a schedule active at `now`? Handles windows that cross midnight (e.g. 22:00–02:00). */
export function isScheduleActive(schedule: Schedule | null, now: Date): boolean {
  if (!schedule) return true;
  const { day, minutes } = localTime(now, schedule.tz);
  const start = schedule.start ? toMin(schedule.start) : 0;
  const end = schedule.end ? toMin(schedule.end) : 24 * 60;
  if (start <= end) return schedule.days.includes(day) && minutes >= start && minutes < end;
  // Overnight window: active late on a listed day, or early on the following day.
  const prev = WEEKDAYS[(WEEKDAYS.indexOf(day) + 6) % 7] as Weekday;
  return (schedule.days.includes(day) && minutes >= start) || (schedule.days.includes(prev) && minutes < end);
}

export function isExpired(deal: Deal, now: Date): boolean {
  if (!deal.expires) return false;
  return now.toISOString().slice(0, 10) > deal.expires;
}

export interface DealQuery {
  country?: string;
  region?: string;
  city?: string;
  campus?: string;
  /** Free-text match on brand / title / conditions. */
  query?: string;
  mode?: "pickup" | "delivery" | "any";
  studentOnly?: boolean;
  activeNow?: boolean;
  maxPriceMinor?: number;
  now?: Date;
  limit?: number;
}

const DELIVERY_CHANNELS: Channel[] = [
  "delivery",
  "doordash",
  "ubereats",
  "skip",
  "grubhub",
  "talabat",
  "deliveroo",
  "careem",
  "noon",
  "keeta",
];

export function matchesMode(deal: Deal, mode: DealQuery["mode"]): boolean {
  if (!mode || mode === "any") return true;
  if (mode === "pickup") return deal.channels.some((c) => c === "pickup" || c === "dine_in" || c === "tgtg");
  return deal.channels.some((c) => DELIVERY_CHANNELS.includes(c));
}

/**
 * Filter deals for a place. A campus query resolves to its city/region, and also matches
 * region-wide (city "*") and national (region "*") deals for that country.
 */
export function findDeals(deals: Deal[], regions: Region[], q: DealQuery): Deal[] {
  const now = q.now ?? new Date();
  let { country, region, city } = q;
  if (q.campus) {
    for (const r of regions) {
      const c = r.campuses.find((x) => x.slug === q.campus);
      if (c) {
        country = r.country;
        region = r.region;
        city = c.city;
      }
    }
  }
  const text = q.query?.toLowerCase().trim();

  const filtered = deals.filter((d) => {
    if (isExpired(d, now)) return false;
    if (country && d.country !== country) return false;
    if (region && d.region !== "*" && d.region !== region) return false;
    if (city && d.city !== "*" && d.city !== city) return false;
    if (q.studentOnly && !d.student_only) return false;
    if (!matchesMode(d, q.mode)) return false;
    if (q.activeNow && !isScheduleActive(d.schedule, now)) return false;
    if (q.maxPriceMinor !== undefined && d.value && "amount_minor" in d.value && d.type === "fixed_price") {
      if (d.value.amount_minor > q.maxPriceMinor) return false;
    }
    if (text) {
      const hay = `${d.brand} ${d.title} ${d.conditions ?? ""}`.toLowerCase();
      if (!text.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });

  // Campus-specific first, then most recently verified.
  filtered.sort((a, b) => {
    const ac = q.campus && a.campuses.includes(q.campus) ? 0 : 1;
    const bc = q.campus && b.campuses.includes(q.campus) ? 0 : 1;
    return ac - bc || b.verified_at.localeCompare(a.verified_at);
  });
  return q.limit ? filtered.slice(0, q.limit) : filtered;
}
