import { Deal, Platform, Region } from "./schema.ts";

export interface Dataset {
  deals: Deal[];
  regions: Region[];
  platforms: Platform[];
}

/** Validate a bundle produced by scripts/build-data.ts (works in browsers, Workers and Node). */
export function parseDataset(json: unknown): Dataset {
  const j = json as { deals?: unknown[]; regions?: unknown[]; platforms?: unknown[] };
  return {
    deals: (j.deals ?? []).map((d) => Deal.parse(d)),
    regions: (j.regions ?? []).map((r) => Region.parse(r)),
    platforms: (j.platforms ?? []).map((p) => Platform.parse(p)),
  };
}

/** Fetch and validate a dataset bundle from a URL. */
export async function loadDataUrl(url: string): Promise<Dataset> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch dataset: HTTP ${res.status}`);
  return parseDataset(await res.json());
}
