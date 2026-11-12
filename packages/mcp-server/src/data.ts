import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Dataset, loadDataUrl } from "@munchmap/core";
import { loadDataDir } from "@munchmap/core/node";

/** Public bundle published by the Pages workflow (available once the repo is public). */
export const DEFAULT_DATA_URL = "https://sizzleman.github.io/munchmap/data.json";

let cached: Promise<Dataset> | null = null;

/**
 * Where the data comes from, in order:
 * 1. MUNCHMAP_DATA env var: a local data/ directory OR an https URL to a data.json bundle
 * 2. The repo's own data/ directory (when running from a clone)
 * 3. The published bundle at DEFAULT_DATA_URL (when installed via npx)
 */
export function getDataset(): Promise<Dataset> {
  cached ??= load();
  return cached;
}

async function load(): Promise<Dataset> {
  const env = process.env.MUNCHMAP_DATA;
  if (env?.startsWith("https://")) return loadDataUrl(env);
  const dir = env ?? join(import.meta.dirname, "..", "..", "..", "data");
  if (!existsSync(dir)) {
    if (env) throw new Error(`munchmap data not found at ${dir}. Check MUNCHMAP_DATA.`);
    return loadDataUrl(DEFAULT_DATA_URL);
  }
  const { issues, ...dataset } = loadDataDir(dir);
  if (issues.length) console.error(`[munchmap] ${issues.length} data issues ignored; run npm run validate:data`);
  return dataset;
}
