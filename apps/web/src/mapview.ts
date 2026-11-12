/**
 * Map view: MapLibre + free OpenFreeMap tiles, restaurants from OpenStreetMap, munchmap deals,
 * community menu prices and student ratings on top. Filters and an explainable "for you" list.
 * The map instance is created once and kept alive across re-renders.
 */
import {
  type Candidate,
  dealAllIn,
  dealsForRestaurant,
  findRestaurants,
  formatMoney,
  haversineMeters,
  isOpenNow,
  isScheduleActive,
  mapsSearchUrl,
  menuPriceSummary,
  OSM_ATTRIBUTION,
  osmUrl,
  placeForRestaurant,
  placeLinks,
  type Ranked,
  type Restaurant,
  rankForYou,
  ratingSummary,
} from "@munchmap/core";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { AppCtx } from "./ctx.ts";
import { appendAll, extLink, h, store } from "./dom.ts";
import { getProfile, getTastes } from "./prefs.ts";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

interface Filters {
  deals: boolean;
  onNow: boolean;
  openNow: boolean;
  maxPrice: number; // all-in, minor units; 0 = any
  cuisine: string;
  diet: "" | "vegetarian" | "vegan" | "halal" | "gluten_free";
  takeaway: boolean;
  delivery: boolean;
  student: boolean;
  sort: "for_you" | "distance" | "price";
}
const DEFAULT_FILTERS: Filters = {
  deals: false,
  onNow: false,
  openNow: false,
  maxPrice: 0,
  cuisine: "",
  diet: "",
  takeaway: false,
  delivery: false,
  student: false,
  sort: "for_you",
};

// Long-lived state (survives tab switches)
let root: HTMLElement | null = null;
let map: MlMap | null = null;
let currentAreaKey = "";
let ctxRef: AppCtx | null = null;
const restaurants = new Map<string, Restaurant>();
let filters: Filters = { ...DEFAULT_FILTERS, ...store.get<Partial<Filters>>("mapFilters", {}) };
let status: { kind: "idle" | "loading" | "error"; text: string } = { kind: "idle", text: "" };
let selectedId: string | null = null;
let loadTimer: ReturnType<typeof setTimeout> | undefined;
const loadedKeys = new Set<string>();
/** Area covered by the pre-built snapshot (live queries are skipped inside it). */
let snapshot: { lat: number; lon: number; radius_m: number } | null = null;

/** "campus:uiuc" → "campus-uiuc", "city:AE/DU/dubai" → "city-ae-du-dubai" (matches scripts/snapshot-osm.ts). */
const snapshotFile = (areaKey: string) => areaKey.replace(":", "-").replaceAll("/", "-").toLowerCase();

async function loadSnapshot(areaKey: string) {
  snapshot = null;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}osm/${snapshotFile(areaKey)}.json`);
    if (!res.ok) return;
    const json = (await res.json()) as {
      center: { lat: number; lon: number };
      radius_m: number;
      restaurants: Omit<Restaurant, "distance_m" | "maps_url" | "osm_url">[];
    };
    if (areaKey !== currentAreaKey) return; // user switched areas meanwhile
    for (const r of json.restaurants)
      restaurants.set(r.id, {
        ...r,
        distance_m: 0,
        maps_url: mapsSearchUrl(`${r.name} ${r.lat},${r.lon}`),
        osm_url: osmUrl(r.lat, r.lon),
      });
    snapshot = { ...json.center, radius_m: json.radius_m };
    renderPanel();
    refresh();
  } catch {
    /* no snapshot yet: fall back to live queries */
  }
}

const panel = h("div", { class: "map-panel" });
const listEl = h("div", { class: "map-list" });
const statusEl = h("div", { class: "map-status", "aria-live": "polite" });
const detailEl = h("div", { class: "map-detail" });

export function mapView(ctx: AppCtx): HTMLElement {
  ctxRef = ctx;
  if (!root) {
    const mapEl = h("div", { class: "map", id: "map", role: "region", "aria-label": "Map of restaurants" });
    root = h(
      "section",
      { class: "mapview", "aria-label": "Map" },
      panel,
      h("div", { class: "map-wrap" }, mapEl, statusEl),
      detailEl,
      listEl,
    );
    void initMap(mapEl);
  }
  if (currentAreaKey !== ctx.area.key) {
    currentAreaKey = ctx.area.key;
    restaurants.clear();
    loadedKeys.clear();
    selectedId = null;
    map?.jumpTo({ center: [ctx.area.lon, ctx.area.lat], zoom: 15 });
    void loadSnapshot(ctx.area.key).then(() => scheduleLoad(0));
  }
  renderPanel();
  refresh();
  requestAnimationFrame(() => map?.resize());
  return root;
}

async function initMap(container: HTMLElement) {
  const [ml, worker] = await Promise.all([
    import("maplibre-gl"),
    // MapLibre v6 runs tile parsing in a separate module worker; Vite must emit it as its own file.
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ]);
  ml.setWorkerUrl(worker.default);
  const area = ctxRef?.area;
  const m = new ml.Map({
    container,
    style: STYLE_URL,
    center: [area?.lon ?? 0, area?.lat ?? 0],
    zoom: 15,
    attributionControl: { compact: true },
  });
  map = m;
  m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
  m.addControl(
    new ml.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false }),
    "top-right",
  );
  m.on("load", () => {
    if (!map) return;
    map.addSource("food", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "food-pins",
      type: "circle",
      source: "food",
      paint: {
        "circle-radius": ["case", ["get", "deal"], 9, 6],
        "circle-color": ["case", ["get", "live"], "#2b8a3e", ["get", "deal"], "#e8590c", "#868e96"],
        "circle-stroke-width": ["case", ["get", "selected"], 3, 1.5],
        "circle-stroke-color": "#ffffff",
        "circle-opacity": ["case", ["get", "dim"], 0.35, 0.95],
      },
    });
    map.addLayer({
      id: "food-prices",
      type: "symbol",
      source: "food",
      filter: ["!=", ["get", "price"], ""],
      layout: {
        "text-field": ["get", "price"],
        "text-size": 11,
        "text-offset": [0, -1.4],
        "text-font": ["Noto Sans Bold"],
        "text-allow-overlap": false,
      },
      paint: { "text-color": "#1f1a17", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
    map.on("click", "food-pins", (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) select(id);
    });
    map.on("mouseenter", "food-pins", () => {
      if (map) map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "food-pins", () => {
      if (map) map.getCanvas().style.cursor = "";
    });
    map.on("moveend", () => scheduleLoad(700));
    refresh();
    scheduleLoad(0);
  });
}

function scheduleLoad(delay: number) {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(loadVisible, delay);
}

async function loadVisible() {
  if (!map || !ctxRef) return;
  if (map.getZoom() < 13.5) {
    setStatus("idle", "Zoom in to see restaurants.");
    return;
  }
  const c = map.getCenter();
  const b = map.getBounds();
  const radius = Math.min(
    3000,
    Math.max(300, haversineMeters({ lat: c.lat, lon: c.lng }, { lat: b.getNorth(), lon: b.getEast() })),
  );
  // Inside the pre-built snapshot? No need to hit the (often slow) public servers.
  if (snapshot && haversineMeters({ lat: c.lat, lon: c.lng }, snapshot) + radius < snapshot.radius_m) {
    setStatus("idle", "");
    return;
  }
  // Don't re-query the same ~250 m cell at a similar radius.
  const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)},${Math.round(radius / 500)}`;
  if (loadedKeys.has(key)) return;
  setStatus("loading", "Loading restaurants from OpenStreetMap…");
  try {
    const found = await findRestaurants({ lat: c.lat, lon: c.lng, radius_m: radius, limit: 400 });
    loadedKeys.add(key);
    for (const r of found) restaurants.set(r.id, r);
    setStatus("idle", "");
    refresh();
  } catch (e) {
    setStatus("error", (e as Error).message);
  }
}

function setStatus(kind: typeof status.kind, text: string) {
  status = { kind, text };
  statusEl.replaceChildren();
  if (!text) return;
  appendAll(
    statusEl,
    h("span", {}, text),
    kind === "error"
      ? h(
          "button",
          {
            class: "chip",
            onclick: () => {
              loadedKeys.clear();
              scheduleLoad(0);
            },
          },
          "Retry",
        )
      : null,
  );
}

// ---------- data shaping ----------

function candidates(): Ranked[] {
  if (!ctxRef) return [];
  const { data, area } = ctxRef;
  const now = new Date();
  const ctx = { country: area.region.country, region: area.region.region, city: area.city };
  const origin = { lat: area.lat, lon: area.lon };
  const list: Candidate[] = [...restaurants.values()].map((r0) => {
    const r = { ...r0, distance_m: Math.round(haversineMeters(origin, r0)) };
    return {
      restaurant: r,
      deals: dealsForRestaurant(r, data.deals, ctx, now),
      place: placeForRestaurant(r, data.places),
    };
  });
  const ranked = rankForYou(list, {
    profile: getProfile(),
    region: area.region,
    city: area.city,
    tastes: getTastes(),
    now,
  });
  return ranked.filter((c) => matches(c, now));
}

function matches(c: Ranked, now: Date): boolean {
  const r = c.restaurant;
  if (filters.deals && !c.deals.length) return false;
  if (filters.onNow && !c.deals.some((d) => isScheduleActive(d.schedule, now))) return false;
  if (filters.student && !c.deals.some((d) => d.student_only)) return false;
  if (filters.openNow && isOpenNow(r.opening_hours, ctxRef?.area.region.timezone ?? "UTC", now) !== true) return false;
  if (filters.maxPrice && (c.cheapest_all_in === null || c.cheapest_all_in > filters.maxPrice)) return false;
  if (
    filters.cuisine &&
    !(r.cuisine ?? "")
      .toLowerCase()
      .split(/[;,]/)
      .map((x) => x.trim())
      .includes(filters.cuisine)
  )
    return false;
  if (filters.diet && !r.diet[filters.diet]) return false;
  if (filters.takeaway && !/^(yes|only)$/.test(r.takeaway ?? "")) return false;
  if (
    filters.delivery &&
    !/^(yes|only)$/.test(r.delivery ?? "") &&
    !c.deals.some((d) => !d.channels.includes("pickup"))
  )
    return false;
  return true;
}

function sorted(list: Ranked[]): Ranked[] {
  if (filters.sort === "distance") return [...list].sort((a, b) => a.restaurant.distance_m - b.restaurant.distance_m);
  if (filters.sort === "price")
    return [...list].sort(
      (a, b) => (a.cheapest_all_in ?? Number.MAX_SAFE_INTEGER) - (b.cheapest_all_in ?? Number.MAX_SAFE_INTEGER),
    );
  return list;
}

const money = (n: number) => (ctxRef ? formatMoney(n, ctxRef.area.region.currency) : String(n));

function refresh() {
  if (!ctxRef) return;
  const now = new Date();
  const visible = sorted(candidates());
  const visibleIds = new Set(visible.map((v) => v.restaurant.id));
  const all = [...restaurants.values()];
  const source = map?.getSource("food") as GeoJSONSource | undefined;
  source?.setData({
    type: "FeatureCollection",
    features: all.map((r) => {
      const v = visible.find((x) => x.restaurant.id === r.id);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lon, r.lat] },
        properties: {
          id: r.id,
          deal: !!v?.deals.length,
          live: !!v?.deals.some((d) => isScheduleActive(d.schedule, now)),
          price: v?.cheapest_all_in ? money(v.cheapest_all_in) : "",
          selected: r.id === selectedId,
          dim: !visibleIds.has(r.id),
        },
      };
    }),
  });
  renderList(visible);
  renderDetail();
}

// ---------- UI ----------

function renderPanel() {
  const set = (patch: Partial<Filters>) => {
    filters = { ...filters, ...patch };
    store.set("mapFilters", filters);
    renderPanel();
    refresh();
  };
  const chip = (label: string, on: boolean, onclick: () => void) =>
    h("button", { class: on ? "chip on" : "chip", "aria-pressed": on ? "true" : "false", onclick }, label);
  const cuisines = [
    ...new Set(
      [...restaurants.values()].flatMap((r) =>
        (r.cuisine ?? "")
          .toLowerCase()
          .split(/[;,]/)
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ),
  ].sort();
  const cur = ctxRef?.area.region.currency ?? "USD";
  const select = (label: string, value: string, options: [string, string][], onchange: (v: string) => void) => {
    const el = h("select", {
      "aria-label": label,
      onchange: (e: Event) => onchange((e.target as HTMLSelectElement).value),
    });
    for (const [v, l] of options) el.append(h("option", { value: v, selected: v === value }, l));
    return el;
  };
  panel.replaceChildren(
    h(
      "div",
      { class: "chips" },
      chip("🏷️ Deals", filters.deals, () => set({ deals: !filters.deals })),
      chip("⏰ Deal on now", filters.onNow, () => set({ onNow: !filters.onNow })),
      chip("🕒 Open now", filters.openNow, () => set({ openNow: !filters.openNow })),
      chip("🎓 Student", filters.student, () => set({ student: !filters.student })),
      chip("🥡 Takeaway", filters.takeaway, () => set({ takeaway: !filters.takeaway })),
      chip("🛵 Delivery", filters.delivery, () => set({ delivery: !filters.delivery })),
    ),
    h(
      "div",
      { class: "selects" },
      select(
        "All-in price",
        String(filters.maxPrice),
        [
          ["0", "Any price"],
          ["1000", `≤ ${formatMoney(1000, cur)} all-in`],
          ["1500", `≤ ${formatMoney(1500, cur)} all-in`],
          ["2000", `≤ ${formatMoney(2000, cur)} all-in`],
          ["3000", `≤ ${formatMoney(3000, cur)} all-in`],
        ],
        (v) => set({ maxPrice: Number(v) }),
      ),
      select(
        "Cuisine",
        filters.cuisine,
        [["", "Any cuisine"], ...cuisines.map((c): [string, string] => [c, c.replaceAll("_", " ")])],
        (v) => set({ cuisine: v }),
      ),
      select(
        "Diet",
        filters.diet,
        [
          ["", "Any diet"],
          ["vegetarian", "Vegetarian"],
          ["vegan", "Vegan"],
          ["halal", "Halal"],
          ["gluten_free", "Gluten-free"],
        ],
        (v) => set({ diet: v as Filters["diet"] }),
      ),
      select(
        "Sort",
        filters.sort,
        [
          ["for_you", "Sort: for you"],
          ["distance", "Sort: nearest"],
          ["price", "Sort: cheapest"],
        ],
        (v) => set({ sort: v as Filters["sort"] }),
      ),
      JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)
        ? h("button", { class: "chip", onclick: () => set({ ...DEFAULT_FILTERS }) }, "Reset")
        : null,
    ),
  );
}

function renderList(visible: Ranked[]) {
  listEl.replaceChildren();
  const total = restaurants.size;
  if (!total) return;
  const priced = visible.filter((v) => v.cheapest_all_in !== null).length;
  appendAll(
    listEl,
    h(
      "p",
      { class: "count" },
      `${visible.length} of ${total} places · ${priced} with known all-in prices`,
      filters.maxPrice ? " (places without price data are hidden by the price filter)" : "",
    ),
    h(
      "ul",
      { class: "cards compact" },
      ...visible.slice(0, 60).map((c) => {
        const r = c.restaurant;
        const rating = ratingSummary(c.place);
        return h(
          "li",
          {
            class: r.id === selectedId ? "card pick selected" : "card pick",
            tabindex: 0,
            onclick: () => select(r.id, true),
            onkeydown: (e: Event) => {
              if ((e as KeyboardEvent).key === "Enter") select(r.id, true);
            },
          },
          h(
            "div",
            { class: "card-top" },
            h("strong", {}, r.name),
            c.cheapest_all_in !== null
              ? h("span", { class: "value" }, `from ${money(c.cheapest_all_in)}`, h("small", {}, " all-in"))
              : h("span", { class: "muted small" }, distanceText(r.distance_m)),
          ),
          h(
            "div",
            { class: "badges" },
            ...c.reasons.slice(0, 3).map((x) => h("span", { class: "badge" }, x)),
            rating ? h("span", { class: "badge muted" }, `★ ${rating.worth_it}/5 worth it`) : null,
            r.cuisine
              ? h("span", { class: "badge muted" }, r.cuisine.replaceAll(";", ", ").replaceAll("_", " "))
              : null,
            c.cheapest_all_in !== null ? h("span", { class: "badge muted" }, distanceText(r.distance_m)) : null,
          ),
        );
      }),
    ),
    h("p", { class: "attribution" }, OSM_ATTRIBUTION, " · Map tiles: OpenFreeMap / OpenMapTiles"),
  );
}

const distanceText = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

function select(id: string, fly = false) {
  selectedId = id;
  const r = restaurants.get(id);
  if (fly && r && map) map.easeTo({ center: [r.lon, r.lat], zoom: Math.max(map.getZoom(), 16) });
  refresh();
  detailEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderDetail() {
  detailEl.replaceChildren();
  if (!selectedId || !ctxRef) return;
  const c = candidates().find((x) => x.restaurant.id === selectedId) ?? null;
  const r0 = restaurants.get(selectedId);
  if (!r0) return;
  const { area, data } = ctxRef;
  const r = c?.restaurant ?? r0;
  const deals =
    c?.deals ??
    dealsForRestaurant(r, data.deals, { country: area.region.country, region: area.region.region, city: area.city });
  const place = c?.place ?? placeForRestaurant(r, data.places);
  const menu = place ? menuPriceSummary(place, area.region) : null;
  const rating = ratingSummary(place);
  const open = isOpenNow(r.opening_hours, area.region.timezone);
  const target = { name: r.name, lat: r.lat, lon: r.lon, osm: r.id };

  appendAll(
    detailEl,
    h(
      "div",
      { class: "card detail" },
      h(
        "div",
        { class: "card-top" },
        h("strong", { class: "brand" }, r.name),
        h(
          "button",
          {
            class: "icon",
            "aria-label": "Close",
            onclick: () => {
              selectedId = null;
              refresh();
            },
          },
          "✕",
        ),
      ),
      h(
        "div",
        { class: "badges" },
        open === true ? h("span", { class: "badge live" }, "● Open now") : null,
        open === false ? h("span", { class: "badge muted" }, "Closed now") : null,
        r.cuisine ? h("span", { class: "badge muted" }, r.cuisine.replaceAll(";", ", ").replaceAll("_", " ")) : null,
        h("span", { class: "badge muted" }, distanceText(r.distance_m)),
        r.diet.vegan
          ? h("span", { class: "badge muted" }, "vegan options")
          : r.diet.vegetarian
            ? h("span", { class: "badge muted" }, "veg options")
            : null,
        r.diet.halal ? h("span", { class: "badge muted" }, "halal") : null,
      ),
      r.opening_hours ? h("p", { class: "muted small" }, r.opening_hours) : null,
      deals.length
        ? h(
            "div",
            { class: "detail-section" },
            h("h3", {}, "Deals"),
            ...deals.map((d) => {
              const a = dealAllIn(d, area.region, area.city);
              return h(
                "p",
                {},
                h("strong", {}, a ? `${money(a.total_minor)}${a.excludes.length ? "+" : ""} ` : ""),
                d.title,
                " ",
                extLink(d.source_url, "source ↗"),
              );
            }),
          )
        : null,
      h(
        "div",
        { class: "detail-section" },
        h("h3", {}, "Prices"),
        menu
          ? h(
              "p",
              {},
              `Items from ${money(menu.min_all_in)} · typical ${money(menu.median_all_in)} — all-in for pickup${menu.tax_unknown ? " (tax not yet known here)" : ", incl. tax"}. `,
              h("span", { class: "muted small" }, `${menu.items} items, updated ${place?.menu_verified_at ?? "?"}`),
            )
          : h("p", { class: "muted" }, "No menu prices yet."),
        h(
          "button",
          { class: "btn ghost", onclick: () => ctxRef?.go("share", target) },
          menu ? "Update prices" : "Add menu prices",
        ),
      ),
      h(
        "div",
        { class: "detail-section" },
        h("h3", {}, "Students say"),
        rating
          ? h(
              "p",
              {},
              `★ ${rating.worth_it}/5 worth it`,
              rating.portion ? ` · portions ${rating.portion}/5` : "",
              rating.student_friendly ? ` · student-friendly ${rating.student_friendly}/5` : "",
              h("span", { class: "muted small" }, ` (${rating.count} rating${rating.count === 1 ? "" : "s"})`),
            )
          : h("p", { class: "muted" }, "No student ratings yet."),
        h("button", { class: "btn ghost", onclick: () => ctxRef?.go("share", target) }, "Rate it"),
      ),
      h(
        "div",
        { class: "detail-section" },
        h("h3", {}, "Reviews & menus elsewhere"),
        h(
          "p",
          { class: "links" },
          ...placeLinks(r, area.cityName, area.region.platforms).flatMap((l) => [extLink(l.url, `${l.label} ↗`), " "]),
          r.website ? extLink(r.website, "Website ↗") : null,
        ),
        h(
          "p",
          { class: "muted small" },
          "Want a summary across all of these? Ask your AI with munchmap connected: “review sweep for ",
          r.name,
          "”.",
        ),
      ),
    ),
  );
}
