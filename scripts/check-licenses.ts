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

function licenseFromFile(pkgDir: string): string | null {
  for (const f of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license"]) {
    const file = join(pkgDir, f);
    if (!existsSync(file)) continue;
    const t = readFileSync(file, "utf8");
    if (/Permission is hereby granted, free of charge/.test(t)) return "MIT";
    if (/Redistribution and use in source and binary forms/.test(t))
      return /Neither the name/.test(t) ? "BSD-3-Clause" : "BSD-2-Clause";
    if (/ISC License|Permission to use, copy, modify, and\/or distribute/.test(t)) return "ISC";
  }
  return null;
}

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
    let lic = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "UNKNOWN");
    // Some packages ship only a LICENSE file with no SPDX id; recognize the common permissive texts.
    if (lic === "UNKNOWN") lic = licenseFromFile(p) ?? lic;
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
