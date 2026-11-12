/**
 * Fail if any installed production dependency has a license incompatible with AGPL-3.0,
 * and print a list for THIRD_PARTY_NOTICES.md. Uses package.json metadata only (no network).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_IDS =
  /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|0BSD|BlueOak-1\.0\.0|CC0-1\.0|CC-BY-4\.0|Unlicense|Python-2\.0|MPL-2\.0|LGPL-[23]\.[01].*|GPL-3\.0.*|AGPL-3\.0.*)$/;
/** Evaluate simple SPDX expressions: "A OR B" needs one allowed, "A AND B" needs all. */
const allowed = (expr: string): boolean => {
  const e = expr.replace(/[()]/g, "").trim();
  if (e.includes(" OR ")) return e.split(" OR ").some(allowed);
  return e.split(" AND ").every((id) => ALLOWED_IDS.test(id.trim()));
};
const nm = join(import.meta.dirname, "..", "node_modules");
const rows: string[] = [];
const bad: string[] = [];

function visit(dir: string) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    if (name.startsWith("@")) {
      visit(p);
      continue;
    }
    const pj = join(p, "package.json");
    if (!existsSync(pj)) continue;
    const pkg = JSON.parse(readFileSync(pj, "utf8"));
    if (pkg.name?.startsWith("@munchmap/")) continue;
    const lic = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "UNKNOWN");
    rows.push(`| ${pkg.name} | ${pkg.version} | ${lic} |`);
    if (!allowed(lic)) bad.push(`${pkg.name}@${pkg.version}: ${lic}`);
  }
}
visit(nm);
if (process.argv.includes("--table"))
  console.log(["| Package | Version | License |", "|---|---|---|", ...rows.sort()].join("\n"));
if (bad.length) {
  console.error(`Licenses needing review:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(`✅ ${rows.length} packages, all licenses compatible.`);
