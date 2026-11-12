import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { parse } from "yaml";
import type { Dataset } from "./dataset.ts";
import { Deal, Platform, Region } from "./schema.ts";

export type { Dataset };

export interface LoadIssue {
  file: string;
  message: string;
}

export interface LoadResult extends Dataset {
  issues: LoadIssue[];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".yaml") || name.endsWith(".yml")) out.push(p);
  }
  return out.sort();
}

/**
 * Load and validate everything under data/.
 * Layout: data/<CC>/<REGION|_national>/{region.yaml, deals/*.yaml, platforms/*.yaml}
 */
export function loadDataDir(dataDir: string): LoadResult {
  const result: LoadResult = { deals: [], regions: [], platforms: [], issues: [] };
  const seen = new Set<string>();

  for (const file of walk(dataDir)) {
    const rel = relative(dataDir, file);
    const parts = rel.split(sep);
    const [cc, regionDir] = parts;
    const kind = parts.length === 3 && parts[2]?.startsWith("region.") ? "region" : parts[2];
    let raw: unknown;
    try {
      raw = parse(readFileSync(file, "utf8"));
    } catch (e) {
      result.issues.push({ file: rel, message: `YAML parse error: ${(e as Error).message}` });
      continue;
    }

    const issue = (message: string) => result.issues.push({ file: rel, message });
    const fileId = basename(file).replace(/\.ya?ml$/, "");

    if (kind === "region") {
      const r = Region.safeParse(raw);
      if (!r.success) {
        issue(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        continue;
      }
      if (r.data.country !== cc || r.data.region !== regionDir)
        issue(`country/region (${r.data.country}/${r.data.region}) must match folder ${cc}/${regionDir}`);
      result.regions.push(r.data);
    } else if (kind === "deals") {
      const r = Deal.safeParse(raw);
      if (!r.success) {
        issue(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        continue;
      }
      const d = r.data;
      if (d.id !== fileId) issue(`id "${d.id}" must equal file name "${fileId}"`);
      if (d.country !== cc) issue(`country ${d.country} must match folder ${cc}`);
      const expectedRegionDir = d.region === "*" ? "_national" : d.region;
      if (expectedRegionDir !== regionDir) issue(`region ${d.region} must live in folder ${cc}/${expectedRegionDir}`);
      if (seen.has(d.id)) issue(`duplicate id ${d.id}`);
      seen.add(d.id);
      result.deals.push(d);
    } else if (kind === "platforms") {
      const r = Platform.safeParse(raw);
      if (!r.success) {
        issue(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        continue;
      }
      if (r.data.id !== fileId) issue(`id "${r.data.id}" must equal file name "${fileId}"`);
      if (r.data.country !== cc) issue(`country ${r.data.country} must match folder ${cc}`);
      result.platforms.push(r.data);
    } else {
      issue("unexpected file location (expected region.yaml, deals/*.yaml or platforms/*.yaml)");
    }
  }

  // Cross-checks: deal currency matches its region; campus refs exist.
  const regionByKey = new Map(result.regions.map((r) => [`${r.country}/${r.region}`, r]));
  const campusSlugs = new Set(result.regions.flatMap((r) => r.campuses.map((c) => c.slug)));
  for (const d of result.deals) {
    const region = regionByKey.get(`${d.country}/${d.region}`);
    if (d.value && "currency" in d.value && region && d.value.currency !== region.currency)
      result.issues.push({ file: d.id, message: `currency ${d.value.currency} ≠ region currency ${region.currency}` });
    for (const c of d.campuses)
      if (!campusSlugs.has(c)) result.issues.push({ file: d.id, message: `unknown campus "${c}"` });
  }
  return result;
}
