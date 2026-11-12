import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Dataset, loadDataDir, loadDataUrl } from "@munchmap/core";

let cached: Dataset | null = null;

/**
 * Where the data comes from, in order:
 * 1. MUNCHMAP_DATA env var: a local data/ directory OR an https URL to a data.json bundle
 * 2. The repo's own data/ directory (when running from a clone)
 */
export async function getDataset(): Promise<Dataset> {
  if (cached) return cached;
  const env = process.env.MUNCHMAP_DATA;
  if (env?.startsWith("https://")) {
    cached = await loadDataUrl(env);
    return cached;
  }
  const dir = env ?? join(import.meta.dirname, "..", "..", "..", "data");
  if (!existsSync(dir)) throw new Error(`munchmap data not found at ${dir}. Set MUNCHMAP_DATA.`);
  const { issues, ...dataset } = loadDataDir(dir);
  if (issues.length) console.error(`[munchmap] ${issues.length} data issues ignored; run npm run validate:data`);
  cached = dataset;
  return cached;
}
