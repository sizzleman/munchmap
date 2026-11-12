/**
 * munchmap web app. Static, no accounts, no tracking.
 * Preferences live in this browser only (localStorage). All community text is rendered with
 * textContent (never innerHTML) so data can't inject markup.
 */
import {
  type Channel,
  type ChannelQuote,
  compareChannels,
  type Dataset,
  type Deal,
  type DealQuery,
  findDeals,
  findRestaurants,
  formatMoney,
  isScheduleActive,
  OSM_ATTRIBUTION,
  parseDataset,
  prepareSubmission,
  type Region,
  type Restaurant,
  type Weekday,
} from "@munchmap/core";
import "./style.css";

const REPO_URL = "https://github.com/sizzleman/munchmap";
type Tab = "deals" | "compare" | "nearby" | "share";

// ---------- tiny DOM helper (safe: text via textContent) ----------
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children)
    if (c !== null && c !== undefined && c !== false) el.append(typeof c === "number" ? String(c) : c);
  return el;
}
const appendAll = (el: HTMLElement, ...children: Child[]) => {
  for (const c of children)
    if (c !== null && c !== undefined && c !== false) el.append(typeof c === "number" ? String(c) : c);
};
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : "#");
const extLink = (href: string, text: string) =>
  h("a", { href: safeHref(href), target: "_blank", rel: "noopener noreferrer" }, text);

// ---------- local preferences (best effort; app works without storage) ----------
const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(`munchmap:${key}`);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`munchmap:${key}`, JSON.stringify(value));
    } catch {
      /* private mode etc. */
    }
  },
};

// ---------- state ----------
interface Place {
  key: string; // "campus:uiuc" | "city:AE/DU/dubai"
  label: string;
  group: string;
  region: Region;
  campus?: string;
  city: string;
  lat: number;
  lon: number;
}

const state = {
  data: null as Dataset | null,
  places: [] as Place[],
  placeKey: store.get<string>("place", ""),
  tab: store.get<Tab>("tab", "deals"),
  query: "",
  mode: store.get<"any" | "pickup" | "delivery">("mode", "any"),
  studentOnly: false,
  activeNow: false,
  restaurants: null as Restaurant[] | null,
  restaurantsError: "",
  loadingRestaurants: false,
};

const app = document.getElementById("app") as HTMLElement;
const place = () => state.places.find((p) => p.key === state.placeKey) ?? state.places[0];

function buildPlaces(ds: Dataset): Place[] {
  const out: Place[] = [];
  const countryName: Record<string, string> = { US: "🇺🇸 United States", CA: "🇨🇦 Canada", AE: "🇦🇪 UAE" };
  for (const r of ds.regions) {
    const group = countryName[r.country] ?? r.country;
    for (const c of r.campuses)
      out.push({
        key: `campus:${c.slug}`,
        label: c.name,
        group,
        region: r,
        campus: c.slug,
        city: c.city,
        lat: c.lat,
        lon: c.lon,
      });
    for (const city of r.cities)
      if (!r.campuses.some((c) => c.city === city.slug))
        out.push({
          key: `city:${r.country}/${r.region}/${city.slug}`,
          label: `${city.name} (city-wide)`,
          group,
          region: r,
          city: city.slug,
          lat: city.lat,
          lon: city.lon,
        });
  }
  return out.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
}

function setState(patch: Partial<typeof state>) {
  Object.assign(state, patch);
  if (patch.placeKey !== undefined) {
    store.set("place", state.placeKey);
    state.restaurants = null;
    state.restaurantsError = "";
  }
  if (patch.tab !== undefined) store.set("tab", state.tab);
  if (patch.mode !== undefined) store.set("mode", state.mode);
  render();
}

// ---------- formatting ----------
const DAY_LABEL: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const CHANNEL_LABEL: Partial<Record<Channel, string>> = {
  pickup: "Pickup",
  delivery: "Delivery",
  dine_in: "Dine-in",
  first_party_site: "Restaurant site",
  first_party_app: "Restaurant app",
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  skip: "Skip",
  grubhub: "Grubhub",
  talabat: "talabat",
  deliveroo: "Deliveroo",
  careem: "Careem",
  noon: "noon",
  keeta: "Keeta",
  tgtg: "Too Good To Go",
  other: "In store",
};
const valueText = (d: Deal) =>
  d.value && "amount_minor" in d.value
    ? formatMoney(d.value.amount_minor, d.value.currency)
    : d.value
      ? `${d.value.percent}% off`
      : d.type === "bogo"
        ? "BOGO"
        : d.type === "loyalty"
          ? "Rewards"
          : d.type === "surplus"
            ? "Surplus"
            : "Deal";
const scheduleText = (d: Deal) => {
  if (!d.schedule) return "Any time";
  const days = d.schedule.days.length === 7 ? "Daily" : d.schedule.days.map((x) => DAY_LABEL[x]).join(", ");
  const time = d.schedule.start || d.schedule.end ? ` · ${d.schedule.start ?? ""}–${d.schedule.end ?? ""}` : "";
  return days + time;
};

// ---------- views ----------
function header() {
  const p = place();
  const select = h("select", {
    id: "place",
    "aria-label": "Campus or city",
    onchange: (e: Event) => setState({ placeKey: (e.target as HTMLSelectElement).value }),
  });
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const pl of state.places) {
    let g = groups.get(pl.group);
    if (!g) {
      g = h("optgroup", { label: pl.group });
      groups.set(pl.group, g);
      select.append(g);
    }
    g.append(h("option", { value: pl.key, selected: pl.key === p?.key }, pl.label));
  }
  const tabs: [Tab, string][] = [
    ["deals", "Deals"],
    ["compare", "Compare"],
    ["nearby", "Nearby"],
    ["share", "Share a deal"],
  ];
  return h(
    "header",
    { class: "top" },
    h(
      "div",
      { class: "brand-row" },
      h("h1", { class: "logo" }, h("span", { "aria-hidden": "true" }, "🍕"), " munchmap"),
      select,
    ),
    h(
      "nav",
      { class: "tabs", role: "tablist" },
      ...tabs.map(([id, label]) =>
        h(
          "button",
          {
            role: "tab",
            "aria-selected": state.tab === id ? "true" : "false",
            class: state.tab === id ? "tab active" : "tab",
            onclick: () => setState({ tab: id }),
          },
          label,
        ),
      ),
    ),
  );
}

function dealsView() {
  const p = place();
  const ds = state.data;
  if (!p || !ds) return h("p", {}, "Loading…");
  const q: DealQuery = {
    query: state.query || undefined,
    mode: state.mode,
    studentOnly: state.studentOnly,
    activeNow: state.activeNow,
  };
  if (p.campus) q.campus = p.campus;
  else Object.assign(q, { country: p.region.country, region: p.region.region, city: p.city });
  const deals = findDeals(ds.deals, ds.regions, q);
  const now = new Date();

  const chip = (label: string, on: boolean, onclick: () => void) =>
    h("button", { class: on ? "chip on" : "chip", "aria-pressed": on ? "true" : "false", onclick }, label);

  const filters = h(
    "div",
    { class: "filters" },
    h("input", {
      type: "search",
      placeholder: "Search pizza, boba, tacos…",
      value: state.query,
      "aria-label": "Search deals",
      oninput: (e: Event) => {
        state.query = (e.target as HTMLInputElement).value;
        const list = document.getElementById("deal-list");
        list?.replaceWith(dealList());
      },
    }),
    h(
      "div",
      { class: "chips" },
      chip("Any", state.mode === "any", () => setState({ mode: "any" })),
      chip("Pickup", state.mode === "pickup", () => setState({ mode: "pickup" })),
      chip("Delivery", state.mode === "delivery", () => setState({ mode: "delivery" })),
      chip("🎓 Student", state.studentOnly, () => setState({ studentOnly: !state.studentOnly })),
      chip("⏰ On now", state.activeNow, () => setState({ activeNow: !state.activeNow })),
    ),
  );

  function dealList() {
    const fresh = findDeals(ds?.deals ?? [], ds?.regions ?? [], { ...q, query: state.query || undefined });
    if (!fresh.length)
      return h(
        "div",
        { id: "deal-list", class: "empty" },
        h("p", {}, `No deals match yet for ${p?.label}.`),
        h("button", { class: "btn", onclick: () => setState({ tab: "share" }) }, "Know one? Share it →"),
      );
    return h(
      "ul",
      { id: "deal-list", class: "cards" },
      ...fresh.map((d) => {
        const live = d.schedule && isScheduleActive(d.schedule, now);
        const reportUrl = `${REPO_URL}/issues/new?${new URLSearchParams({
          template: "bug.yml",
          title: `[deal issue] ${d.id}`,
        })}`;
        return h(
          "li",
          { class: "card" },
          h(
            "div",
            { class: "card-top" },
            h("strong", { class: "brand" }, d.brand),
            h("span", { class: "value" }, valueText(d)),
          ),
          h("p", { class: "title" }, d.title),
          h(
            "div",
            { class: "badges" },
            live ? h("span", { class: "badge live" }, "● On now") : null,
            d.student_only ? h("span", { class: "badge" }, "🎓 Student") : null,
            d.region === "*" ? h("span", { class: "badge" }, "Nationwide") : null,
            h("span", { class: "badge muted" }, scheduleText(d)),
            ...d.channels.map((c) => h("span", { class: "badge muted" }, CHANNEL_LABEL[c] ?? c)),
          ),
          d.conditions ? h("p", { class: "conditions" }, d.conditions) : null,
          d.promo_code ? h("p", { class: "code" }, "Code: ", h("code", {}, d.promo_code)) : null,
          h(
            "div",
            { class: "card-foot" },
            extLink(d.source_url, "Source ↗"),
            h("span", {}, `verified ${d.verified_at}`),
            d.expires ? h("span", {}, `ends ${d.expires}`) : null,
            extLink(reportUrl, "Report"),
          ),
        );
      }),
    );
  }

  return h(
    "section",
    { "aria-label": "Deals" },
    filters,
    h("p", { class: "count" }, `${deals.length} deal${deals.length === 1 ? "" : "s"} near ${p.label}`),
    dealList(),
  );
}

// ---------- compare ----------
interface Row {
  channel: string;
  subtotal: string;
  delivery: string;
  service: string;
  promo: string;
  member: boolean;
}
const compareRows: Row[] = store.get<Row[]>("compare", [
  { channel: "pickup", subtotal: "", delivery: "", service: "", promo: "", member: false },
  { channel: "ubereats", subtotal: "", delivery: "", service: "", promo: "", member: false },
]);
const toMinor = (s: string) => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

function compareView() {
  const p = place();
  const ds = state.data;
  if (!p || !ds) return h("p", {}, "Loading…");
  const region = p.region;
  const channels = ["pickup", "first_party_site", ...region.platforms];
  // Rows are remembered across places; snap any channel that doesn't operate here to a local one.
  for (const r of compareRows) if (!channels.includes(r.channel)) r.channel = region.platforms[0] ?? "first_party_site";
  const out = h("div", { class: "results", "aria-live": "polite" });

  const recompute = () => {
    store.set("compare", compareRows);
    const quotes: ChannelQuote[] = compareRows
      .filter((r) => toMinor(r.subtotal) > 0)
      .map((r) => {
        const subtotal = toMinor(r.subtotal);
        const isPickup = r.channel === "pickup";
        return {
          channel: CHANNEL_LABEL[r.channel as Channel] ?? r.channel,
          subtotal_minor: subtotal,
          delivery_fee_minor: toMinor(r.delivery),
          service_fee_bps: Math.round((Number.parseFloat(r.service) || 0) * 100),
          promo_minor: toMinor(r.promo),
          membership_free_delivery: r.member,
          tip_bps: isPickup || r.channel === "first_party_site" ? 0 : Math.round(region.tipping.default_percent * 100),
        };
      });
    out.replaceChildren();
    if (quotes.length < 1) {
      out.append(h("p", { class: "muted" }, "Enter the menu subtotal you see on each option."));
      return;
    }
    const res = compareChannels(quotes, region.currency, region.tax);
    const m = (n: number) => formatMoney(n, region.currency);
    appendAll(
      out,
      quotes.length > 1 && res.savings_vs_priciest_minor > 0
        ? h(
            "p",
            { class: "savings" },
            `${res.cheapest} saves you ${m(res.savings_vs_priciest_minor)} vs the most expensive option`,
          )
        : null,
      h(
        "ol",
        { class: "ranked" },
        ...res.ranked.map((r, i) =>
          h(
            "li",
            { class: i === 0 ? "best" : "" },
            h("div", { class: "rank-top" }, h("strong", {}, r.channel), h("span", { class: "total" }, m(r.total))),
            h(
              "small",
              {},
              `food ${m(r.subtotal)} · fees ${m(r.fees)} · tax ${r.tax_unknown ? "n/a" : m(r.tax)} · tip ${m(r.tip)}${r.promo ? ` · promo −${m(r.promo)}` : ""}`,
            ),
          ),
        ),
      ),
      h(
        "p",
        { class: "muted small" },
        region.tax
          ? `Tax: ${region.tax.rate_bps / 100}%${region.tax.included_in_menu_price ? " (already in menu prices)" : ""}. `
          : "Tax for this area isn't in our data yet, so totals exclude tax. ",
        region.tipping.customary
          ? `Delivery tip assumed at ${region.tipping.default_percent}%. Estimates only.`
          : "Tipping isn't customary here. Estimates only.",
      ),
    );
  };

  const rowEl = (r: Row, i: number) => {
    const input = (key: "subtotal" | "delivery" | "service" | "promo", label: string, ph: string) =>
      h(
        "label",
        { class: "field" },
        h("span", {}, label),
        h("input", {
          inputmode: "decimal",
          placeholder: ph,
          value: r[key],
          oninput: (e: Event) => {
            r[key] = (e.target as HTMLInputElement).value;
            recompute();
          },
        }),
      );
    const sel = h("select", {
      "aria-label": "Channel",
      onchange: (e: Event) => {
        r.channel = (e.target as HTMLSelectElement).value;
        recompute();
      },
    });
    for (const c of channels)
      sel.append(h("option", { value: c, selected: c === r.channel }, CHANNEL_LABEL[c as Channel] ?? c));
    return h(
      "fieldset",
      { class: "quote" },
      h(
        "div",
        { class: "quote-head" },
        sel,
        compareRows.length > 1
          ? h(
              "button",
              {
                class: "icon",
                "aria-label": "Remove option",
                onclick: () => {
                  compareRows.splice(i, 1);
                  render();
                },
              },
              "✕",
            )
          : null,
      ),
      h(
        "div",
        { class: "grid" },
        input("subtotal", "Menu subtotal", "12.50"),
        r.channel === "pickup" ? null : input("delivery", "Delivery fee", "2.99"),
        r.channel === "pickup" ? null : input("service", "Service fee %", "15"),
        input("promo", "Promo off", "0"),
      ),
      r.channel === "pickup"
        ? null
        : h(
            "label",
            { class: "check" },
            h("input", {
              type: "checkbox",
              checked: r.member,
              onchange: (e: Event) => {
                r.member = (e.target as HTMLInputElement).checked;
                recompute();
              },
            }),
            " I have a membership with free delivery",
          ),
    );
  };

  const memberships = ds.platforms
    .filter((pl) => pl.country === region.country)
    .flatMap((pl) => pl.memberships.map((m) => ({ pl, m })));

  const section = h(
    "section",
    { "aria-label": "Compare" },
    h("p", { class: "lead" }, "Same order, different apps. Type in what each one shows and see the real total."),
    ...compareRows.map(rowEl),
    compareRows.length < 6
      ? h(
          "button",
          {
            class: "btn ghost",
            onclick: () => {
              compareRows.push({
                channel: "doordash",
                subtotal: "",
                delivery: "",
                service: "",
                promo: "",
                member: false,
              });
              render();
            },
          },
          "+ Add option",
        )
      : null,
    out,
    memberships.length
      ? h(
          "details",
          { class: "memberships" },
          h("summary", {}, `Delivery memberships in ${region.country === "AE" ? "the UAE" : region.country}`),
          h(
            "ul",
            {},
            ...memberships.map(({ pl, m }) =>
              h(
                "li",
                {},
                h("strong", {}, `${pl.name} · ${m.name}`),
                " ",
                m.price ? `${formatMoney(m.price.amount_minor, m.price.currency)}/${m.period}` : "price unverified",
                m.student_price
                  ? ` (students ${formatMoney(m.student_price.amount_minor, m.student_price.currency)})`
                  : "",
                m.free_delivery_min_subtotal
                  ? ` · free delivery over ${formatMoney(m.free_delivery_min_subtotal.amount_minor, m.free_delivery_min_subtotal.currency)}`
                  : "",
                " ",
                extLink(m.source_url, "source"),
                h("span", { class: "muted" }, ` · verified ${m.verified_at}`),
              ),
            ),
          ),
        )
      : null,
  );
  recompute();
  return section;
}

// ---------- nearby ----------
let cuisine = "";
let radius = 1200;
async function loadRestaurants(lat: number, lon: number) {
  setState({ loadingRestaurants: true, restaurantsError: "" });
  try {
    const restaurants = await findRestaurants({ lat, lon, radius_m: radius, cuisine: cuisine || undefined, limit: 40 });
    setState({ restaurants, loadingRestaurants: false });
  } catch (e) {
    setState({ restaurantsError: (e as Error).message, loadingRestaurants: false });
  }
}

function nearbyView() {
  const p = place();
  if (!p) return h("p", {}, "Loading…");
  const radiusSel = h("select", {
    "aria-label": "Radius",
    onchange: (e: Event) => {
      radius = Number((e.target as HTMLSelectElement).value);
    },
  });
  for (const r of [500, 1200, 2000, 3000])
    radiusSel.append(h("option", { value: r, selected: r === radius }, r < 1000 ? `${r} m` : `${r / 1000} km`));

  return h(
    "section",
    { "aria-label": "Nearby restaurants" },
    h(
      "div",
      { class: "filters row" },
      h("input", {
        type: "search",
        placeholder: "Cuisine (pizza, indian, sushi…)",
        value: cuisine,
        "aria-label": "Cuisine",
        oninput: (e: Event) => {
          cuisine = (e.target as HTMLInputElement).value;
        },
      }),
      radiusSel,
      h(
        "button",
        { class: "btn", onclick: () => loadRestaurants(p.lat, p.lon) },
        `Search near ${p.label.split(" (")[0]}`,
      ),
      h(
        "button",
        {
          class: "btn ghost",
          title: "Your location is sent only to OpenStreetMap's search server, never to munchmap.",
          onclick: () =>
            navigator.geolocation?.getCurrentPosition(
              (pos) => loadRestaurants(pos.coords.latitude, pos.coords.longitude),
              () => setState({ restaurantsError: "Couldn't get your location." }),
            ),
        },
        "📍 Near me",
      ),
    ),
    state.loadingRestaurants ? h("p", { class: "muted" }, "Searching OpenStreetMap…") : null,
    state.restaurantsError ? h("p", { class: "error" }, state.restaurantsError) : null,
    state.restaurants
      ? h(
          "ul",
          { class: "cards compact" },
          ...state.restaurants.map((r) =>
            h(
              "li",
              { class: "card" },
              h(
                "div",
                { class: "card-top" },
                h("strong", {}, r.name),
                h(
                  "span",
                  { class: "muted" },
                  r.distance_m < 1000 ? `${r.distance_m} m` : `${(r.distance_m / 1000).toFixed(1)} km`,
                ),
              ),
              h(
                "div",
                { class: "badges" },
                h("span", { class: "badge muted" }, r.kind.replace("_", " ")),
                r.cuisine ? h("span", { class: "badge muted" }, r.cuisine.replaceAll(";", ", ")) : null,
                r.takeaway === "yes" ? h("span", { class: "badge muted" }, "takeaway") : null,
              ),
              r.opening_hours ? h("small", { class: "muted" }, r.opening_hours) : null,
              h(
                "div",
                { class: "card-foot" },
                extLink(r.maps_url, "Map ↗"),
                r.website ? extLink(r.website, "Website ↗") : null,
              ),
            ),
          ),
        )
      : h("p", { class: "muted" }, "Find restaurants, cafés and fast food around you."),
    h("p", { class: "attribution" }, OSM_ATTRIBUTION),
  );
}

// ---------- share ----------
function shareView() {
  const p = place();
  if (!p) return h("p", {}, "Loading…");
  const result = h("div", { class: "results", "aria-live": "polite" });
  const days: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const channels: Channel[] = ["pickup", "dine_in", "first_party_site", "first_party_app", ...p.region.platforms];

  const form = h(
    "form",
    {
      class: "share",
      onsubmit: (e: Event) => {
        e.preventDefault();
        const f = new FormData(e.target as HTMLFormElement);
        const s = (k: string) => String(f.get(k) ?? "").trim();
        const amount = s("amount");
        const kind = s("valueKind");
        const pickedDays = days.filter((d) => f.get(`day-${d}`));
        const draft = prepareSubmission({
          title: s("title"),
          brand: s("brand"),
          country: p.region.country,
          region: s("scope") === "national" ? "*" : p.region.region,
          city: s("scope") === "national" ? "*" : p.city,
          campuses: p.campus && s("scope") === "campus" ? [p.campus] : [],
          channels: channels.filter((c) => f.get(`ch-${c}`)),
          type: s("type"),
          value: !amount
            ? null
            : kind === "percent"
              ? { percent: Number(amount) }
              : { amount_minor: toMinor(amount), currency: p.region.currency },
          schedule: pickedDays.length
            ? { days: pickedDays, start: s("start") || null, end: s("end") || null, tz: p.region.timezone }
            : null,
          conditions: s("conditions") || null,
          student_only: Boolean(f.get("student")),
          promo_code: s("code") || null,
          source_url: s("source"),
          expires: s("expires") || null,
        });
        result.replaceChildren();
        appendAll(
          result,
          ...draft.warnings.map((w) => h("p", { class: "warn" }, `⚠️ ${w}`)),
          ...draft.errors.map((er) => h("p", { class: "error" }, er)),
          draft.ok && draft.issue_url
            ? h(
                "div",
                { class: "ready" },
                h(
                  "p",
                  {},
                  "Looks good! Review it, then open the prefilled GitHub issue to submit. Nothing has been sent yet.",
                ),
                h("pre", {}, draft.yaml ?? ""),
                h(
                  "a",
                  { class: "btn", href: draft.issue_url, target: "_blank", rel: "noopener noreferrer" },
                  "Open GitHub issue ↗",
                ),
              )
            : null,
        );
      },
    },
    h(
      "p",
      { class: "lead" },
      "Share a public deal with everyone. Personal info and single-use codes get stripped automatically.",
    ),
    h(
      "label",
      { class: "field" },
      h("span", {}, "Restaurant"),
      h("input", { name: "brand", required: true, placeholder: "Antonio's Pizza" }),
    ),
    h(
      "label",
      { class: "field" },
      h("span", {}, "The deal"),
      h("input", { name: "title", required: true, placeholder: "$3 slices every Wednesday" }),
    ),
    h(
      "label",
      { class: "field" },
      h("span", {}, "Where"),
      h(
        "select",
        { name: "scope" },
        p.campus ? h("option", { value: "campus" }, `Near ${p.label}`) : null,
        h("option", { value: "city" }, `Anywhere in ${p.city}`),
        h("option", { value: "national" }, "Nationwide chain deal"),
      ),
    ),
    h(
      "div",
      { class: "grid" },
      h(
        "label",
        { class: "field" },
        h("span", {}, "Type"),
        h(
          "select",
          { name: "type" },
          ...[
            ["fixed_price", "Fixed price"],
            ["percent_off", "% off"],
            ["amount_off", "$ off"],
            ["bogo", "Buy one get one"],
            ["free_item", "Free item"],
            ["free_delivery", "Free delivery"],
            ["loyalty", "Loyalty / rewards"],
            ["surplus", "Surplus food"],
          ].map(([v, l]) => h("option", { value: v }, l)),
        ),
      ),
      h(
        "label",
        { class: "field" },
        h("span", {}, "Value"),
        h("input", { name: "amount", inputmode: "decimal", placeholder: "3.00 or 15" }),
      ),
      h(
        "label",
        { class: "field" },
        h("span", {}, "Value is"),
        h(
          "select",
          { name: "valueKind" },
          h("option", { value: "money" }, `${p.region.currency} amount`),
          h("option", { value: "percent" }, "Percent"),
        ),
      ),
    ),
    h(
      "fieldset",
      { class: "boxes" },
      h("legend", {}, "Where does it work?"),
      ...channels.map((c) =>
        h("label", { class: "check" }, h("input", { type: "checkbox", name: `ch-${c}` }), ` ${CHANNEL_LABEL[c] ?? c}`),
      ),
    ),
    h(
      "fieldset",
      { class: "boxes" },
      h("legend", {}, "Days (leave empty if any day)"),
      ...days.map((d) =>
        h("label", { class: "check" }, h("input", { type: "checkbox", name: `day-${d}` }), ` ${DAY_LABEL[d]}`),
      ),
      h(
        "div",
        { class: "grid" },
        h("label", { class: "field" }, h("span", {}, "From"), h("input", { type: "time", name: "start" })),
        h("label", { class: "field" }, h("span", {}, "Until"), h("input", { type: "time", name: "end" })),
      ),
    ),
    h(
      "label",
      { class: "field" },
      h("span", {}, "Conditions"),
      h("input", { name: "conditions", placeholder: "Student ID, pickup only, min order…" }),
    ),
    h("label", { class: "check" }, h("input", { type: "checkbox", name: "student" }), " Students only"),
    h(
      "div",
      { class: "grid" },
      h(
        "label",
        { class: "field" },
        h("span", {}, "Public promo code"),
        h("input", { name: "code", placeholder: "optional" }),
      ),
      h("label", { class: "field" }, h("span", {}, "Ends on"), h("input", { type: "date", name: "expires" })),
    ),
    h(
      "label",
      { class: "field" },
      h("span", {}, "Public source link"),
      h("input", {
        name: "source",
        type: "url",
        required: true,
        placeholder: "https://… (restaurant site, official post, campus page)",
      }),
    ),
    h("button", { class: "btn", type: "submit" }, "Check & prepare"),
  );
  return h("section", { "aria-label": "Share a deal" }, form, result);
}

function footer() {
  return h(
    "footer",
    {},
    h(
      "p",
      {},
      "Free & open source (",
      extLink(`${REPO_URL}/blob/main/LICENSE`, "AGPL-3.0"),
      ") · ",
      extLink(REPO_URL, "Source code"),
      " · Data ",
      extLink(`${REPO_URL}/blob/main/data/LICENSE`, "CC BY-SA 4.0"),
      " · ",
      extLink(`${REPO_URL}/blob/main/docs/PRIVACY.md`, "Privacy"),
    ),
    h(
      "p",
      { class: "muted small" },
      "No accounts, no tracking. Your settings stay in this browser. Deals are community-sourced, so confirm with the restaurant. Not affiliated with any restaurant or delivery app.",
    ),
  );
}

function render() {
  const views: Record<Tab, () => HTMLElement> = {
    deals: dealsView,
    compare: compareView,
    nearby: nearbyView,
    share: shareView,
  };
  const focusedId = document.activeElement?.id;
  app.replaceChildren(header(), h("main", {}, views[state.tab]()), footer());
  if (focusedId) document.getElementById(focusedId)?.focus();
}

async function boot() {
  app.replaceChildren(h("p", { class: "loading" }, "Loading deals…"));
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseDataset(await res.json());
    const places = buildPlaces(data);
    setState({
      data,
      places,
      placeKey: places.some((p) => p.key === state.placeKey)
        ? state.placeKey
        : ((places.find((p) => p.campus) ?? places[0])?.key ?? ""),
    });
  } catch (e) {
    app.replaceChildren(h("p", { class: "error" }, `Couldn't load deals (${(e as Error).message}). Try again.`));
  }
}

boot();
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
