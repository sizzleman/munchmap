/**
 * Share menu prices (from a photo via the user's own AI, or typed in) and student ratings
 * for a restaurant. Everything is drafted locally and submitted by the user as a GitHub issue.
 */
import { formatMoney, preparePlaceSubmission } from "@munchmap/core";
import { extractMenu } from "./ai.ts";
import type { AppCtx, PlaceTarget } from "./ctx.ts";
import { appendAll, h, toMinor } from "./dom.ts";
import { getAi } from "./prefs.ts";

interface Row {
  name: string;
  price: string;
}

export function placeForms(ctx: AppCtx, target: PlaceTarget | null): HTMLElement {
  if (!target)
    return h(
      "div",
      { class: "empty" },
      h("p", {}, "Pick a restaurant on the Map first, then tap “Add menu prices” or “Rate it”."),
      h("button", { class: "btn", onclick: () => ctx.go("map") }, "Open the map"),
    );

  const cur = ctx.area.region.currency;
  const rows: Row[] = [{ name: "", price: "" }];
  const result = h("div", { class: "results", "aria-live": "polite" });
  const rowsEl = h("div", { class: "menu-rows" });
  const aiStatus = h("p", { class: "muted small", "aria-live": "polite" });
  let source: "photo" | "website" | "receipt" | "in_person" = "photo";
  let sourceUrl = "";
  let worth = 0;
  let portion = 0;
  let friendly = 0;
  let note = "";

  const drawRows = () => {
    rowsEl.replaceChildren(
      ...rows.map((r, i) =>
        h(
          "div",
          { class: "menu-row" },
          h("input", {
            "aria-label": "Item",
            placeholder: "Item (e.g. Cheese slice)",
            value: r.name,
            oninput: (e: Event) => {
              r.name = (e.target as HTMLInputElement).value;
            },
          }),
          h("input", {
            "aria-label": "Price",
            inputmode: "decimal",
            placeholder: "3.50",
            value: r.price,
            oninput: (e: Event) => {
              r.price = (e.target as HTMLInputElement).value;
            },
          }),
          h(
            "button",
            {
              class: "icon",
              type: "button",
              "aria-label": "Remove item",
              onclick: () => {
                rows.splice(i, 1);
                if (!rows.length) rows.push({ name: "", price: "" });
                drawRows();
              },
            },
            "✕",
          ),
        ),
      ),
    );
  };
  drawRows();

  const stars = (label: string, get: () => number, set: (n: number) => void) => {
    const wrap = h("div", { class: "stars", role: "radiogroup", "aria-label": label });
    const draw = () =>
      wrap.replaceChildren(
        h("span", { class: "muted small" }, `${label}: `),
        ...[1, 2, 3, 4, 5].map((n) =>
          h(
            "button",
            {
              type: "button",
              role: "radio",
              "aria-checked": get() === n ? "true" : "false",
              "aria-label": `${n} of 5`,
              class: get() >= n ? "star on" : "star",
              onclick: () => {
                set(get() === n ? 0 : n);
                draw();
              },
            },
            "★",
          ),
        ),
      );
    draw();
    return wrap;
  };

  const photoInput = h("input", {
    type: "file",
    accept: "image/*",
    capture: "environment",
    "aria-label": "Menu or receipt photo",
    onchange: async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const ai = getAi();
      aiStatus.textContent = `Reading the menu with ${ai.preset === "ollama" ? `your local model (${ai.model})` : ai.model || "your model"}…`;
      try {
        const items = await extractMenu(file, ai);
        rows.splice(0, rows.length, ...items.map((i) => ({ name: i.name, price: (i.price_minor / 100).toFixed(2) })));
        if (!rows.length) rows.push({ name: "", price: "" });
        drawRows();
        aiStatus.textContent = `Found ${items.length} items. Check them carefully: AI makes mistakes.`;
        source = "photo";
      } catch (err) {
        aiStatus.textContent = (err as Error).message;
      }
    },
  });

  const submit = () => {
    const menu = rows
      .map((r) => ({ name: r.name.trim(), price_minor: toMinor(r.price) }))
      .filter((r) => r.name && r.price_minor > 0);
    const draft = preparePlaceSubmission({
      place: {
        name: target.name,
        country: ctx.area.region.country,
        region: ctx.area.region.region,
        city: ctx.area.city,
        lat: target.lat,
        lon: target.lon,
        osm: target.osm,
      },
      currency: cur,
      menu,
      menu_source: menu.length ? source : null,
      menu_source_url: source === "website" && sourceUrl ? sourceUrl : null,
      rating: worth
        ? { worth_it: worth, portion: portion || null, student_friendly: friendly || null, note: note || null }
        : undefined,
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
              "Ready to share. Nothing has been sent yet. Open the GitHub issue to submit.",
              menu.length && source !== "website"
                ? " If you used a photo, drag it into the issue so a maintainer can check the prices."
                : "",
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
  };

  return h(
    "div",
    { class: "share" },
    h("h2", { class: "place-title" }, target.name),
    h(
      "fieldset",
      { class: "boxes" },
      h("legend", {}, "Menu prices (as listed, before tax)"),
      h(
        "p",
        { class: "muted small" },
        "Snap the menu or a receipt and your own AI reads it (set it up under Me → AI for menu photos). Or type a few items. munchmap adds tax so everyone sees all-in prices.",
      ),
      h("label", { class: "field" }, h("span", {}, "📷 Menu or receipt photo"), photoInput),
      aiStatus,
      rowsEl,
      h(
        "button",
        {
          class: "btn ghost",
          type: "button",
          onclick: () => {
            rows.push({ name: "", price: "" });
            drawRows();
          },
        },
        "+ Add item",
      ),
      h(
        "label",
        { class: "field" },
        h("span", {}, "Or a link to their official online menu (optional)"),
        h("input", {
          type: "url",
          placeholder: "https://…",
          oninput: (e: Event) => {
            sourceUrl = (e.target as HTMLInputElement).value.trim();
            source = sourceUrl ? "website" : "photo";
          },
        }),
      ),
      h("p", { class: "muted small" }, `Prices in ${cur}, e.g. ${formatMoney(350, cur)} → 3.50`),
    ),
    h(
      "fieldset",
      { class: "boxes" },
      h("legend", {}, "Student rating (optional)"),
      stars(
        "Worth it?",
        () => worth,
        (n) => (worth = n),
      ),
      stars(
        "Portion size",
        () => portion,
        (n) => (portion = n),
      ),
      stars(
        "Student-friendly",
        () => friendly,
        (n) => (friendly = n),
      ),
      h(
        "label",
        { class: "field" },
        h("span", {}, "One-line tip (optional, 200 chars)"),
        h("input", {
          maxlength: 200,
          placeholder: "Ask for the student size, it's huge",
          oninput: (e: Event) => {
            note = (e.target as HTMLInputElement).value;
          },
        }),
      ),
    ),
    h("button", { class: "btn", type: "button", onclick: submit }, "Check & prepare"),
    result,
  );
}
