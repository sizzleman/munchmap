# Third-party notices & credits

munchmap is built on the work of other open-source projects and open-data communities. Thank you! 💛

This file lists what we use, under what license, and how we credit it.
**Contributors:** if you add a dependency or data source, add it here in the same PR (see `CONTRIBUTING.md`).
CI runs `npm run licenses:check`, which fails if any installed package has a license that isn't compatible with AGPL-3.0.
Run `npm run licenses:check -- --table` to print the full list of transitive dependencies.

## Data sources

| Source | Used for | License | How we credit / comply |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) via the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | Restaurant names, locations, cuisine, hours, websites | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/) | Every response that includes OSM data shows "© OpenStreetMap contributors". Queries run live and are cached briefly; OSM data is **not** copied into `data/`. We follow the Overpass usage policy: rate-limited, cached, and identified with a generic User-Agent. We fall back across the public instances run by [FOSSGIS (overpass-api.de)](https://overpass-api.de), [private.coffee](https://overpass.private.coffee) and [Kumi Systems](https://overpass.kumi.systems). |
| [OpenFreeMap](https://openfreemap.org) map tiles ([OpenMapTiles](https://openmaptiles.org) schema) | Basemap in the web app | Free service; tiles built from OSM (ODbL) | Map shows "OpenFreeMap © OpenMapTiles, Data from OpenStreetMap". |
| OpenStreetMap snapshots (`public/osm/`) | Pre-built restaurant pins per campus | ODbL 1.0 | Kept separate from `data/`, with its own `LICENSE.md` and attribution. |
| munchmap community registry (`data/`) | Deals, campuses, regions, platform memberships | [CC BY-SA 4.0](data/LICENSE) | Contributors are credited through git history. Each deal links back to its original public `source_url`. |
| Public web pages cited in `source_url` fields | Facts about deals (prices, days, conditions) | Owned by their publishers | We record **facts** in our own words and link to the source. We don't copy marketing copy, logos or images. |

## Runtime dependencies

| Package | License | Project |
|---|---|---|
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MIT | Model Context Protocol TypeScript SDK |
| [zod](https://github.com/colinhacks/zod) | MIT | Schema validation |
| [yaml](https://github.com/eemeli/yaml) | ISC | YAML parser |
| [opening_hours.js](https://github.com/opening-hours/opening_hours.js) | LGPL-3.0-only | Parses OSM `opening_hours` for "open now" |
| [suncalc](https://github.com/mourner/suncalc) | BSD-2-Clause | Sunrise/sunset times (used by opening_hours.js) |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | BSD-3-Clause | Interactive map in the web app |

The published `munchmap-mcp` npm bundle and the web app include these runtime dependencies. Their license notices ship alongside (`*.LEGAL.txt`) or are kept in the bundled code.

## Development dependencies (not distributed)

| Package | License |
|---|---|
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [tsx](https://github.com/privatenumber/tsx) | MIT |
| [Vitest](https://github.com/vitest-dev/vitest) | MIT |
| [Biome](https://github.com/biomejs/biome) | MIT OR Apache-2.0 |
| [Vite](https://github.com/vitejs/vite) (web app build) | MIT |
| [esbuild](https://github.com/evanw/esbuild) (npm bundle) | MIT |

## Documents adapted from others

| Document | Source | License |
|---|---|---|
| `CODE_OF_CONDUCT.md` | [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) | CC BY 4.0 |
| `LICENSE` | [GNU AGPL v3](https://www.gnu.org/licenses/agpl-3.0.txt), Free Software Foundation | Verbatim copying permitted |
| `data/LICENSE-CC-BY-SA-4.0.txt` | [Creative Commons](https://creativecommons.org/licenses/by-sa/4.0/legalcode) | CC0 (license text) |

## Inspiration

We aren't affiliated with any of these, but they inspired the approach: Skyscanner and Google Flights (comparison UX), GasBuddy (crowd-sourced prices), Too Good To Go (surplus food), and the "awesome lists" model of community-maintained data on GitHub.

## Trademarks

DoorDash, Uber Eats, SkipTheDishes, Grubhub, Talabat, Deliveroo, Careem, noon, Keeta, Too Good To Go, Chipotle and all other names are trademarks of their respective owners. munchmap isn't affiliated with or endorsed by any of them. We use the names only to identify where a deal applies (nominative use).
