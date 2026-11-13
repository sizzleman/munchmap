/** Validate everything under data/ (schema + cross-file checks). Exit 1 on any issue. */
import { join } from "node:path";
import { cleanUrl, isExpired, looksLikePromptInjection } from "../packages/core/src/index.ts";
import { loadDataDir } from "../packages/core/src/node.ts";

const dataDir = join(import.meta.dirname, "..", "data");
const { deals, regions, platforms, places, issues } = loadDataDir(dataDir);
const now = new Date();
const STALE_DAYS = 90;

const warnings: string[] = [];
for (const d of deals) {
  if (isExpired(d, now)) warnings.push(`${d.id}: expired on ${d.expires} (run npm run expire:deals)`);
  const age = (now.getTime() - Date.parse(d.verified_at)) / 86_400_000;
  if (age > STALE_DAYS) warnings.push(`${d.id}: last verified ${Math.floor(age)} days ago`);
  if (d.verified_at > now.toISOString().slice(0, 10))
    issues.push({ file: d.id, message: "verified_at is in the future" });
}

for (const p of places) {
  if (p.menu_verified_at) {
    const age = (now.getTime() - Date.parse(p.menu_verified_at)) / 86_400_000;
    if (age > STALE_DAYS) warnings.push(`${p.id}: menu last verified ${Math.floor(age)} days ago`);
    if (p.menu_verified_at > now.toISOString().slice(0, 10))
      issues.push({ file: p.id, message: "menu_verified_at is in the future" });
  }
  for (const r of p.ratings) {
    if (r.date > now.toISOString().slice(0, 10))
      issues.push({ file: p.id, message: `rating date ${r.date} is in the future` });
  }
}

// Source links must be clean public URLs: no email tracking / personal query params.
const urls = [
  ...deals.map((d) => [d.id, d.source_url] as const),
  ...places.flatMap((p) => (p.menu_source_url ? [[p.id, p.menu_source_url] as const] : [])),
  ...regions.flatMap((r) =>
    [r.tax, ...r.cities.map((c) => c.tax)].flatMap((t) =>
      t ? [[`${r.country}/${r.region} tax`, t.source_url] as const] : [],
    ),
  ),
  ...platforms.flatMap((p) => [
    [p.id, p.source_url] as const,
    ...p.memberships.map((m) => [`${p.id}/${m.id}`, m.source_url] as const),
  ]),
];
for (const [id, url] of urls)
  if (cleanUrl(url) !== new URL(url).toString())
    issues.push({ file: id, message: `source_url has tracking/personal params or is a tracking redirect: ${url}` });
for (const p of platforms)
  for (const m of p.memberships) {
    const age = (now.getTime() - Date.parse(m.verified_at)) / 86_400_000;
    if (age > STALE_DAYS) warnings.push(`${p.id}/${m.id}: last verified ${Math.floor(age)} days ago`);
  }

// Free-text fields are read by users' AI agents: block obvious prompt-injection attempts.
for (const d of deals)
  if (looksLikePromptInjection(`${d.title} ${d.conditions ?? ""} ${d.brand}`))
    issues.push({ file: d.id, message: "text looks like a prompt-injection attempt" });

for (const p of places) {
  const menuText = p.menu.map((m) => `${m.name} ${m.category ?? ""}`).join(" ");
  const ratingText = p.ratings.map((r) => r.note ?? "").join(" ");
  if (looksLikePromptInjection(`${p.name} ${menuText} ${ratingText}`))
    issues.push({ file: p.id, message: "text looks like a prompt-injection attempt" });
}

for (const w of warnings) console.warn(`⚠️  ${w}`);
for (const i of issues) console.error(`❌ ${i.file}: ${i.message}`);
console.log(
  `\n${regions.length} regions · ${deals.length} deals · ${places.length} places · ${platforms.length} platforms · ${issues.length} errors · ${warnings.length} warnings`,
);
process.exit(issues.length ? 1 : 0);
