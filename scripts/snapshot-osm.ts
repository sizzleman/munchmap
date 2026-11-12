/**
 * Snapshot restaurants around every campus/city from OpenStreetMap into public/osm/<area>.json,
 * so the map shows pins instantly even when public Overpass servers are slow or down.
 *
 * License: these files are an extract of OpenStreetMap and stay under the ODbL 1.0
 * (see public/osm/LICENSE.md). They are kept separate from munchmap's CC BY-SA data.
 * Run weekly in CI (.github/workflows/osm-snapshot.yml) or locally: npm run snapshot:osm
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRestaurants, OSM_ATTRIBUTION } from "../packages/core/src/index.ts";
import { loadDataDir } from "../packages/core/src/node.ts";

const root = join(import.meta.dirname, "..");
const outDir = join(root, "public", "osm");
const RADIUS_M = 2500;
mkdirSync(outDir, { recursive: true });

const { regions } = loadDataDir(join(root, "data"));
const areas = regions.flatMap((r) => [
  ...r.campuses.map((c) => ({ key: `campus-${c.slug}`, lat: c.lat, lon: c.lon })),
  ...r.cities
    .filter((city) => !r.campuses.some((c) => c.city === city.slug))
    .map((city) => ({ key: `city-${r.country}-${r.region}-${city.slug}`.toLowerCase(), lat: city.lat, lon: city.lon })),
]);
const only = process.argv[2];
let failures = 0;
for (const a of areas.filter((x) => !only || x.key === only)) {
  try {
    const restaurants = await findRestaurants({ lat: a.lat, lon: a.lon, radius_m: RADIUS_M, limit: 5000 });
    // Drop per-query distance; the app recomputes it from wherever you are.
    const slim = restaurants.map(({ distance_m: _d, maps_url: _m, osm_url: _o, ...r }) => r);
    const file = join(outDir, `${a.key}.json`);
    let previous = 0;
    try {
      previous = (JSON.parse(readFileSync(file, "utf8")) as { restaurants: unknown[] }).restaurants.length;
    } catch {
      /* first run */
    }
    // Guard against a flaky/partial Overpass response wiping a good snapshot.
    if (previous && slim.length < previous * 0.6) {
      console.warn(`⚠️  ${a.key}: got ${slim.length} vs ${previous} before; keeping the old snapshot`);
      continue;
    }
    writeFileSync(
      file,
      JSON.stringify({
        generated_at: new Date().toISOString(),
        license: "ODbL-1.0",
        attribution: OSM_ATTRIBUTION,
        center: { lat: a.lat, lon: a.lon },
        radius_m: RADIUS_M,
        restaurants: slim,
      }),
    );
    console.log(`✅ ${a.key}: ${slim.length} places`);
  } catch (e) {
    failures++;
    console.error(`❌ ${a.key}: ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 3000)); // be polite to public Overpass servers
}
process.exit(failures === areas.length ? 1 : 0);
