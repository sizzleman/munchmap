/**
 * Restaurant lookup via OpenStreetMap's Overpass API.
 * access_method: open_data. Data © OpenStreetMap contributors, ODbL 1.0.
 * Usage policy: https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
 * Results are fetched at query time and NOT stored in our registry (keeps ODbL share-alike separate).
 */
import { haversineMeters, mapsSearchUrl, osmUrl } from "./geo.ts";

export const OSM_ATTRIBUTION = "Restaurant data © OpenStreetMap contributors (ODbL 1.0) — openstreetmap.org/copyright";
/** Public Overpass instances (https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances), tried in order. */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const USER_AGENT = "munchmap-mcp/0.1 (open-source food deal finder)";
const cache = new Map<string, { at: number; data: Restaurant[] }>();
const TTL_MS = 60 * 60 * 1000;
let lastCall = 0;

export interface Restaurant {
  /** OSM reference, e.g. "node/123456". Stable enough to key community data on. */
  id: string;
  name: string;
  brand: string | null;
  lat: number;
  lon: number;
  kind: string;
  cuisine: string | null;
  distance_m: number;
  opening_hours: string | null;
  website: string | null;
  takeaway: string | null;
  delivery: string | null;
  /** Diet options tagged in OSM ("yes"/"only" → true). */
  diet: { vegetarian: boolean; vegan: boolean; halal: boolean; gluten_free: boolean };
  maps_url: string;
  osm_url: string;
}

interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export async function findRestaurants(opts: {
  lat: number;
  lon: number;
  radius_m: number;
  cuisine?: string;
  limit: number;
  endpoint?: string;
}): Promise<Restaurant[]> {
  const radius = Math.min(Math.max(opts.radius_m, 100), 3000);
  const cuisine = opts.cuisine?.toLowerCase().replace(/[^a-z_; -]/g, "");
  const key = `${opts.lat.toFixed(3)},${opts.lon.toFixed(3)},${radius},${cuisine ?? ""}`;
  const hit = cache.get(key);
  let data = hit && Date.now() - hit.at < TTL_MS ? hit.data : null;

  if (!data) {
    // Be polite: at most one request per second from this process.
    const wait = 1000 - (Date.now() - lastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    const cuisineFilter = cuisine ? `["cuisine"~"${cuisine}",i]` : "";
    const q = `[out:json][timeout:${opts.limit > 400 ? 60 : 20}];nwr(around:${radius},${opts.lat},${opts.lon})["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]${cuisineFilter}["name"];out center ${Math.min(5000, Math.max(400, opts.limit))};`;
    // Public instances are often overloaded (429/5xx); fall through to the next mirror.
    let res: Response | null = null;
    let lastError = "";
    for (const endpoint of opts.endpoint ? [opts.endpoint] : OVERPASS_ENDPOINTS) {
      try {
        res = await fetch(endpoint, {
          method: "POST",
          // Browsers send their own User-Agent (and a custom one would trigger a CORS preflight).
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            ...(typeof window === "undefined" ? { "User-Agent": USER_AGENT } : {}),
          },
          body: `data=${encodeURIComponent(q)}`,
          signal: AbortSignal.timeout(opts.limit > 400 ? 90_000 : 12_000),
        });
        if (res.ok) break;
        lastError = `HTTP ${res.status}`;
      } catch (e) {
        const name = (e as Error).name;
        lastError = name === "TimeoutError" || name === "AbortError" ? "servers are busy" : (e as Error).message;
      }
      res = null;
    }
    if (!res) throw new Error(`Couldn't reach OpenStreetMap (${lastError}). Try again in a minute.`);
    const json = (await res.json()) as { elements: OverpassElement[] };
    data = json.elements.flatMap((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      const t = el.tags ?? {};
      if (lat === undefined || lon === undefined || !t.name) return [];
      return [
        {
          id: `${el.type ?? "node"}/${el.id ?? 0}`,
          name: t.name,
          brand: t.brand ?? null,
          lat,
          lon,
          kind: t.amenity ?? "restaurant",
          cuisine: t.cuisine ?? null,
          distance_m: Math.round(haversineMeters({ lat: opts.lat, lon: opts.lon }, { lat, lon })),
          opening_hours: t.opening_hours ?? null,
          website: t.website ?? t["contact:website"] ?? null,
          takeaway: t.takeaway ?? null,
          delivery: t.delivery ?? null,
          diet: {
            vegetarian: /^(yes|only)$/.test(t["diet:vegetarian"] ?? "") || /^(yes|only)$/.test(t["diet:vegan"] ?? ""),
            vegan: /^(yes|only)$/.test(t["diet:vegan"] ?? ""),
            halal: /^(yes|only)$/.test(t["diet:halal"] ?? ""),
            gluten_free: /^(yes|only)$/.test(t["diet:gluten_free"] ?? ""),
          },
          maps_url: mapsSearchUrl(`${t.name} ${lat},${lon}`),
          osm_url: osmUrl(lat, lon),
        },
      ];
    });
    data.sort((a, b) => a.distance_m - b.distance_m);
    cache.set(key, { at: Date.now(), data });
  }
  return data.slice(0, opts.limit);
}
