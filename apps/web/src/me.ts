/**
 * "Me": preferences, taste-list import (Beli export / Google list / pasted names) and AI settings.
 * All of it is stored in this browser only.
 */
import { formatMoney, parseTasteList } from "@munchmap/core";
import type { AppCtx } from "./ctx.ts";
import { appendAll, extLink, h, store, toMinor } from "./dom.ts";
import { AI_PRESETS, type AiSettings, getAi, getProfile, getTastes, setAi, setProfile, setTastes } from "./prefs.ts";

export function meView(ctx: AppCtx): HTMLElement {
  const profile = getProfile();
  const cur = ctx.area.region.currency;
  const saved = h("p", { class: "muted small", "aria-live": "polite" });
  const flash = (t: string) => {
    saved.textContent = t;
    setTimeout(() => (saved.textContent = ""), 2500);
  };
  const csv = (v: string) =>
    v
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);

  const diets: [string, string][] = [
    ["vegetarian", "Vegetarian"],
    ["vegan", "Vegan"],
    ["halal", "Halal"],
    ["gluten_free", "Gluten-free"],
  ];
  const memberships = ctx.data.platforms
    .filter((p) => p.country === ctx.area.region.country)
    .flatMap((p) => p.memberships.map((m) => ({ id: m.id, label: `${p.name} ${m.name}` })));

  // ---- tastes ----
  const tastesInfo = h("p", { class: "muted small", "aria-live": "polite" });
  const drawTastes = () => {
    const t = getTastes();
    tastesInfo.textContent = t.length
      ? `${t.length} places on your list. They're boosted in "for you" on the map.`
      : "No list imported yet.";
  };
  drawTastes();
  const importText = (text: string) => {
    const entries = parseTasteList(text);
    if (!entries.length) return flash("Couldn't find any restaurant names in that.");
    setTastes(entries);
    drawTastes();
    flash(`Imported ${entries.length} places.`);
  };
  const paste = h("textarea", {
    rows: 4,
    placeholder: "Paste names, one per line (optionally with a score, e.g. “Joe's Pizza — 8.7”), or a CSV export.",
  });

  // ---- AI ----
  let ai = getAi();
  const aiForm = h("div", {});
  const drawAi = () => {
    const presetSel = h("select", {
      "aria-label": "AI provider",
      onchange: (e: Event) => {
        const preset = (e.target as HTMLSelectElement).value as AiSettings["preset"];
        ai = { ...ai, preset, ...AI_PRESETS[preset] };
        setAi(ai);
        drawAi();
      },
    });
    for (const [v, l] of [
      ["ollama", "Local model with Ollama (free, private)"],
      ["openai", "OpenAI (your key)"],
      ["gemini", "Google Gemini (your key)"],
      ["custom", "Other OpenAI-compatible API"],
    ])
      presetSel.append(h("option", { value: v, selected: v === ai.preset }, l));
    const field = (label: string, key: "baseUrl" | "model" | "apiKey", type = "text", placeholder = "") =>
      h(
        "label",
        { class: "field" },
        h("span", {}, label),
        h("input", {
          type,
          value: ai[key],
          placeholder,
          autocomplete: "off",
          oninput: (e: Event) => {
            ai = { ...ai, [key]: (e.target as HTMLInputElement).value.trim() };
            setAi(ai);
          },
        }),
      );
    aiForm.replaceChildren();
    appendAll(
      aiForm,
      h("label", { class: "field" }, h("span", {}, "Provider"), presetSel),
      field("API base URL", "baseUrl"),
      field(
        "Vision model",
        "model",
        "text",
        ai.preset === "ollama" ? "gemma3:4b" : "a vision-capable model from your provider",
      ),
      ai.preset === "ollama" ? null : field("API key (stored only in this browser)", "apiKey", "password", "sk-…"),
      ai.preset === "ollama"
        ? h(
            "p",
            { class: "muted small" },
            "Install ",
            extLink("https://ollama.com", "Ollama"),
            ", run ",
            h("code", {}, "ollama pull gemma3:4b"),
            ", then allow this site: ",
            h("code", {}, `OLLAMA_ORIGINS="${location.origin}" ollama serve`),
            ". Photos never leave your computer.",
          )
        : h(
            "p",
            { class: "muted small" },
            "Your key is saved in this browser only and sent directly to your provider, never to munchmap. Use a key with a low spending limit.",
          ),
    );
  };
  drawAi();

  return h(
    "section",
    { class: "me", "aria-label": "Me" },
    h("p", { class: "lead" }, "Everything here stays in this browser. munchmap has no accounts and never sees it."),
    h(
      "fieldset",
      { class: "boxes" },
      h("legend", {}, "What you like"),
      h(
        "label",
        { class: "field" },
        h("span", {}, "Favourite cuisines (comma-separated)"),
        h("input", {
          value: profile.favorite_cuisines.join(", "),
          placeholder: "pizza, indian, sushi, ramen",
          onchange: (e: Event) => {
            setProfile({ favorite_cuisines: csv((e.target as HTMLInputElement).value) });
            flash("Saved");
          },
        }),
      ),
      h(
        "label",
        { class: "field" },
        h("span", {}, "Cuisines to avoid"),
        h("input", {
          value: profile.avoid.join(", "),
          placeholder: "seafood",
          onchange: (e: Event) => {
            setProfile({ avoid: csv((e.target as HTMLInputElement).value) });
            flash("Saved");
          },
        }),
      ),
      h(
        "div",
        {},
        ...diets.map(([v, l]) =>
          h(
            "label",
            { class: "check" },
            h("input", {
              type: "checkbox",
              checked: profile.diet.includes(v),
              onchange: (e: Event) => {
                const on = (e.target as HTMLInputElement).checked;
                const d = getProfile().diet.filter((x) => x !== v);
                setProfile({ diet: on ? [...d, v] : d });
                flash("Saved");
              },
            }),
            ` ${l}`,
          ),
        ),
      ),
      h(
        "label",
        { class: "field" },
        h("span", {}, `Budget per meal, all-in (${cur})`),
        h("input", {
          inputmode: "decimal",
          value: profile.budget_per_meal ? (profile.budget_per_meal.amount_minor / 100).toFixed(2) : "",
          placeholder: (1500 / 100).toFixed(2),
          onchange: (e: Event) => {
            const v = toMinor((e.target as HTMLInputElement).value);
            setProfile({ budget_per_meal: v ? { amount_minor: v, currency: cur } : null });
            flash(v ? `Budget set to ${formatMoney(v, cur)}` : "Budget cleared");
          },
        }),
      ),
      memberships.length
        ? h(
            "div",
            {},
            h("span", { class: "muted small" }, "Memberships you pay for"),
            h(
              "div",
              {},
              ...memberships.map((m) =>
                h(
                  "label",
                  { class: "check" },
                  h("input", {
                    type: "checkbox",
                    checked: profile.memberships.includes(m.id),
                    onchange: (e: Event) => {
                      const on = (e.target as HTMLInputElement).checked;
                      const ms = getProfile().memberships.filter((x) => x !== m.id);
                      setProfile({ memberships: on ? [...ms, m.id] : ms });
                      flash("Saved");
                    },
                  }),
                  ` ${m.label}`,
                ),
              ),
            ),
          )
        : null,
      saved,
    ),
    h(
      "fieldset",
      { class: "boxes" },
      h("legend", {}, "Import your favourites (Beli, Google Maps lists, anything)"),
      h(
        "p",
        { class: "muted small" },
        "Beli has no public API, but you can request your own data from Beli (privacy laws like CCPA/PIPEDA give you that right), or copy names from your lists. Google Maps saved lists come out of Google Takeout. Upload the CSV/JSON or paste names below. It's read on this device only.",
      ),
      h("input", {
        type: "file",
        accept: ".csv,.json,.txt,text/csv,application/json,text/plain",
        "aria-label": "Import file",
        onchange: async (e: Event) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) importText(await f.text());
        },
      }),
      paste,
      h(
        "div",
        { class: "row-buttons" },
        h("button", { class: "btn", type: "button", onclick: () => importText(paste.value) }, "Import pasted list"),
        h(
          "button",
          {
            class: "btn ghost",
            type: "button",
            onclick: () => {
              setTastes([]);
              drawTastes();
              flash("List cleared");
            },
          },
          "Clear list",
        ),
      ),
      tastesInfo,
    ),
    h("fieldset", { class: "boxes" }, h("legend", {}, "AI for menu photos"), aiForm),
    h(
      "button",
      {
        class: "btn ghost",
        type: "button",
        onclick: () => {
          for (const k of ["profile", "tastes", "ai", "mapFilters", "compare"]) store.remove(k);
          appendAll(saved);
          flash("All local munchmap data on this device was deleted.");
          ctx.go("me");
        },
      },
      "Delete everything munchmap saved on this device",
    ),
  );
}
