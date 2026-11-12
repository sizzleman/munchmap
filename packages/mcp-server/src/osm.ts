/**
 * Restaurant lookup via OpenStreetMap's Overpass API.
 * access_method: open_data. Data © OpenStreetMap contributors, ODbL 1.0.
 * Usage policy: https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
 * Results are fetched at query time and NOT stored in our registry (keeps ODbL share-alike separate).
 */
import { haversineMeters, mapsSearchUrl, osmUrl } from "@munchmap/core";

export const OSM_ATTRIBUTION = "Restaurant data © OpenStreetMap contributors (ODbL 1.0) — openstreetmap.org/copyright";
const ENDPOINT = process.env.MUNCHMAP_OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const USER_AGENT = "munchmap-mcp/0.1 (open-source food deal finder)";
const cache = new Map<string, { at: number; data: Restaurant[] }>();
const TTL_MS = 60 * 60 * 1000;
let lastCall = 0;

export interface Restaurant {
  name: string;
  kind: string;
  cuisine: string | null;
  distance_m: number;
  opening_hours: string | null;
  website: string | null;
  takeaway: string | null;
  delivery: string | null;
  maps_url: string;
  osm_url: string;
}

interface OverpassElement {
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
    const q = `[out:json][timeout:20];nwr(around:${radius},${opts.lat},${opts.lon})["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]${cuisineFilter}["name"];out center 200;`;
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(q)}`,
    });
    if (!res.ok) throw new Error(`OpenStreetMap lookup failed (HTTP ${res.status}). Try again in a minute.`);
    const json = (await res.json()) as { elements: OverpassElement[] };
    data = json.elements.flatMap((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      const t = el.tags ?? {};
      if (lat === undefined || lon === undefined || !t.name) return [];
      return [
        {
          name: t.name,
          kind: t.amenity ?? "restaurant",
          cuisine: t.cuisine ?? null,
          distance_m: Math.round(haversineMeters({ lat: opts.lat, lon: opts.lon }, { lat, lon })),
          opening_hours: t.opening_hours ?? null,
          website: t.website ?? t["contact:website"] ?? null,
          takeaway: t.takeaway ?? null,
          delivery: t.delivery ?? null,
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
