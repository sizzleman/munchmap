/** Tiny, safe DOM helpers: text always goes in via textContent/append, never innerHTML. */
export type Child = Node | string | number | null | undefined | false;
export type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  appendAll(el, ...children);
  return el;
}

export function appendAll(el: HTMLElement, ...children: Child[]) {
  for (const c of children)
    if (c !== null && c !== undefined && c !== false) el.append(typeof c === "number" ? String(c) : c);
}

export const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : "#");
export const extLink = (href: string, text: string) =>
  h("a", { href: safeHref(href), target: "_blank", rel: "noopener noreferrer" }, text);

/** Best-effort local storage; the app must work without it (private mode, blocked storage). */
export const store = {
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
      /* ignore */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(`munchmap:${key}`);
    } catch {
      /* ignore */
    }
  },
};

export const toMinor = (s: string) => {
  const n = Number.parseFloat(s.replace(/[^0-9.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
