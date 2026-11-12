/** Bundle data/ into public/data.json for the web app and remote MCP use. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDataDir } from "../packages/core/src/node.ts";

const root = join(import.meta.dirname, "..");
const { issues, ...dataset } = loadDataDir(join(root, "data"));
if (issues.length) {
  console.error(`Refusing to build: ${issues.length} data issues. Run npm run validate:data.`);
  process.exit(1);
}
mkdirSync(join(root, "public"), { recursive: true });
const bundle = {
  generated_at: new Date().toISOString(),
  license: "CC BY-SA 4.0 (munchmap contributors) — see data/LICENSE",
  ...dataset,
};
writeFileSync(join(root, "public", "data.json"), JSON.stringify(bundle));
console.log(`Wrote public/data.json (${dataset.deals.length} deals)`);
