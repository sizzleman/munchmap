/**
 * GitHub Action helper: turn a "new-deal" issue into a data file for a PR.
 * Input: ISSUE_BODY / ISSUE_NUMBER env vars (untrusted text; never interpolated into a shell).
 * Output: writes data/<CC>/<REGION|_national>/deals/<id>.yaml and prints a JSON summary to stdout.
 *
 * Only issues containing a ```yaml block (from the munchmap web app / MCP "prepare_deal_submission")
 * are converted automatically. Plain form submissions get a "needs-triage" label for a maintainer
 * (or the `add-deal` skill) to convert by hand.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import {
  cleanUrl,
  Deal,
  looksLikePromptInjection,
  looksPersonalCode,
  Place,
  scrubText,
} from "../packages/core/src/index.ts";

type Result =
  | { status: "created"; id: string; path: string; warnings: string[] }
  | { status: "needs-triage"; reason: string };

export function issueToDeal(body: string, issueNumber: string, root: string): Result {
  const block = body.match(/```ya?ml\s*\n([\s\S]*?)```/);
  if (!block?.[1])
    return { status: "needs-triage", reason: "No YAML block found; a maintainer will convert this form." };

  let raw: unknown;
  try {
    raw = parse(block[1]);
  } catch (e) {
    return { status: "needs-triage", reason: `YAML could not be parsed: ${(e as Error).message}` };
  }
  if ((raw as { kind?: string })?.kind === "place") return issueToPlace(raw as PlaceDoc, issueNumber, root);
  const parsed = Deal.safeParse({ ...(raw as object), submitted_by: `issue-${issueNumber}` });
  if (!parsed.success)
    return {
      status: "needs-triage",
      reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  const d = parsed.data;
  const warnings: string[] = [];

  // Re-run the privacy and safety checks server-side; never trust the client.
  for (const key of ["title", "conditions"] as const) {
    const v = d[key];
    if (!v) continue;
    const s = scrubText(v);
    if (s.removed.length) {
      warnings.push(`Removed ${s.removed.join(", ")} from ${key}`);
      (d as Record<string, unknown>)[key] = s.text;
    }
  }
  if (looksLikePromptInjection(`${d.title} ${d.brand} ${d.conditions ?? ""}`))
    return { status: "needs-triage", reason: "Text looks like instructions aimed at AI assistants." };
  if (d.promo_code && looksPersonalCode(d.promo_code)) {
    warnings.push("Dropped a promo code that looks personal/single-use");
    d.promo_code = null;
  }
  const clean = cleanUrl(d.source_url);
  if (!clean) return { status: "needs-triage", reason: "source_url is not a clean public link." };
  d.source_url = clean;

  const regionDir = d.region === "*" ? "_national" : d.region;
  const dir = join(root, "data", d.country, regionDir, "deals");
  const path = join(dir, `${d.id}.yaml`);
  if (existsSync(path)) return { status: "needs-triage", reason: `A deal with id ${d.id} already exists.` };
  if (!existsSync(join(root, "data", d.country)))
    return { status: "needs-triage", reason: `Country ${d.country} isn't set up yet (see the add-region guide).` };
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, stringify(d));
  return { status: "created", id: d.id, path: path.slice(root.length + 1), warnings };
}

interface PlaceDoc {
  kind: "place";
  place: {
    id: string;
    name: string;
    country: string;
    region: string;
    city: string;
    lat: number;
    lon: number;
    osm?: string | null;
  };
  menu?: unknown[];
  menu_source?: string | null;
  menu_source_url?: string | null;
  rating?: Record<string, unknown>;
}

/** Create or update data/<CC>/<REGION>/places/<id>.yaml from a menu/rating submission. */
export function issueToPlace(doc: PlaceDoc, issueNumber: string, root: string): Result {
  const p = doc.place;
  if (!p?.id || !p.country || !p.region) return { status: "needs-triage", reason: "Place details are incomplete." };
  if (!/^[a-z0-9-]+$/.test(p.id)) return { status: "needs-triage", reason: "Invalid place id." };
  if (!existsSync(join(root, "data", p.country, p.region, "region.yaml")))
    return { status: "needs-triage", reason: `Region ${p.country}/${p.region} isn't set up yet.` };
  const dir = join(root, "data", p.country, p.region, "places");
  const path = join(dir, `${p.id}.yaml`);
  const existing = existsSync(path) ? (parse(readFileSync(path, "utf8")) as Record<string, unknown>) : null;
  const warnings: string[] = [];

  const next: Record<string, unknown> = existing ?? {
    id: p.id,
    name: p.name,
    country: p.country,
    region: p.region,
    city: p.city,
    lat: p.lat,
    lon: p.lon,
    osm: p.osm ?? null,
    menu: [],
    ratings: [],
  };
  if (doc.menu?.length) {
    next.menu = doc.menu;
    next.menu_source = doc.menu_source ?? null;
    next.menu_source_url = doc.menu_source_url ? cleanUrl(doc.menu_source_url) : null;
    next.menu_verified_at = new Date().toISOString().slice(0, 10);
    if (existing) warnings.push("Replaced the previous menu prices with this newer set.");
  }
  if (doc.rating) {
    const r: Record<string, unknown> = { ...doc.rating, submitted_by: `issue-${issueNumber}` };
    if (typeof r.note === "string") r.note = scrubText(r.note).text.slice(0, 200);
    next.ratings = [...((next.ratings as unknown[]) ?? []), r];
  }
  const parsed = Place.safeParse(next);
  if (!parsed.success)
    return {
      status: "needs-triage",
      reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  const text = `${parsed.data.name} ${parsed.data.menu.map((m) => m.name).join(" ")} ${parsed.data.ratings.map((r) => r.note ?? "").join(" ")}`;
  if (looksLikePromptInjection(text))
    return { status: "needs-triage", reason: "Text looks like instructions aimed at AI assistants." };
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, stringify(parsed.data));
  return { status: "created", id: parsed.data.id, path: path.slice(root.length + 1), warnings };
}

if (import.meta.main ?? process.argv[1]?.endsWith("issue-to-deal.ts")) {
  const root = join(import.meta.dirname, "..");
  const result = issueToDeal(process.env.ISSUE_BODY ?? "", process.env.ISSUE_NUMBER ?? "0", root);
  console.log(JSON.stringify(result));
}
