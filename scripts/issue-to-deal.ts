/**
 * GitHub Action helper: turn a "new-deal" issue into a data file for a PR.
 * Input: ISSUE_BODY / ISSUE_NUMBER env vars (untrusted text; never interpolated into a shell).
 * Output: writes data/<CC>/<REGION|_national>/deals/<id>.yaml and prints a JSON summary to stdout.
 *
 * Only issues containing a ```yaml block (from the munchmap web app / MCP "prepare_deal_submission")
 * are converted automatically. Plain form submissions get a "needs-triage" label for a maintainer
 * (or the `add-deal` skill) to convert by hand.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { cleanUrl, Deal, looksLikePromptInjection, looksPersonalCode, scrubText } from "../packages/core/src/index.ts";

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

if (import.meta.main ?? process.argv[1]?.endsWith("issue-to-deal.ts")) {
  const root = join(import.meta.dirname, "..");
  const result = issueToDeal(process.env.ISSUE_BODY ?? "", process.env.ISSUE_NUMBER ?? "0", root);
  console.log(JSON.stringify(result));
}
