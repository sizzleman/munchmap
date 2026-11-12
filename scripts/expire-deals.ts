/** Move deals whose `expires` date has passed into data/_archive/ (kept for history, not served). */
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { isExpired } from "../packages/core/src/index.ts";
import { loadDataDir } from "../packages/core/src/node.ts";

const root = join(import.meta.dirname, "..");
const dataDir = join(root, "data");
const { deals } = loadDataDir(dataDir);
const now = new Date();
let moved = 0;
for (const d of deals.filter((x) => isExpired(x, now))) {
  const regionDir = d.region === "*" ? "_national" : d.region;
  const from = join(dataDir, d.country, regionDir, "deals", `${d.id}.yaml`);
  const toDir = join(root, "archive", d.country, regionDir);
  mkdirSync(toDir, { recursive: true });
  renameSync(from, join(toDir, `${d.id}.yaml`));
  console.log(`archived ${d.id}`);
  moved++;
}
console.log(`${moved} expired deal(s) archived.`);
