/**
 * Turn a deal the user found (email, notification, post, screenshot) into a public submission
 * WITHOUT sending anything: we scrub personal data, validate, and return a prefilled GitHub
 * issue link the user opens and submits themselves. The user stays in control.
 */

import { stringify } from "yaml";
import { cleanUrl, looksLikePromptInjection, looksPersonalCode, scrubText } from "./privacy.ts";
import { Deal } from "./schema.ts";

export const DEFAULT_REPO = "sizzleman/munchmap";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export interface DraftInput {
  title: string;
  brand: string;
  country: string;
  region: string;
  city: string;
  campuses?: string[];
  channels: string[];
  type: string;
  value?: { amount_minor: number; currency: string } | { percent: number } | null;
  schedule?: { days: string[]; start?: string | null; end?: string | null; tz: string } | null;
  conditions?: string | null;
  student_only?: boolean;
  promo_code?: string | null;
  source_url: string;
  expires?: string | null;
}

export interface DraftResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
  yaml?: string;
  issue_url?: string;
}

export function prepareSubmission(input: DraftInput, opts: { today?: Date; repo?: string } = {}): DraftResult {
  const today = opts.today ?? new Date();
  const repo = opts.repo ?? DEFAULT_REPO;
  const warnings: string[] = [];
  const title = scrubText(input.title);
  const conditions = input.conditions ? scrubText(input.conditions) : null;
  const removed = [...title.removed, ...(conditions?.removed ?? [])];
  if (removed.length) warnings.push(`Removed personal info: ${[...new Set(removed)].join(", ")}`);

  if (looksLikePromptInjection(`${input.title} ${input.brand} ${input.conditions ?? ""}`))
    return {
      ok: false,
      warnings,
      errors: ["Text contains instructions aimed at AI assistants; please describe only the deal."],
    };

  const source = cleanUrl(input.source_url);
  if (!source)
    return {
      ok: false,
      warnings,
      errors: [
        "source_url is missing, invalid, or an email click-tracking link that may identify you. Open the link in a browser and use the final public page URL instead.",
      ],
    };
  if (source !== input.source_url) warnings.push("Removed tracking parameters from source_url.");

  let promo = input.promo_code ?? null;
  if (promo && looksPersonalCode(promo)) {
    warnings.push(`Promo code "${promo}" looks personal/single-use and was NOT included. Only share public codes.`);
    promo = null;
  }

  const region = input.region === "*" ? "national" : input.region.toLowerCase();
  const city = input.city === "*" ? "" : `-${input.city}`;
  const id = `${input.country.toLowerCase()}-${region}${city}-${slugify(input.brand)}-${slugify(title.text)}`.replace(
    /-+/g,
    "-",
  );

  const candidate = {
    id,
    title: title.text,
    brand: input.brand,
    country: input.country,
    region: input.region,
    city: input.city,
    campuses: input.campuses ?? [],
    channels: input.channels,
    type: input.type,
    value: input.value ?? null,
    schedule: input.schedule ?? null,
    conditions: conditions?.text ?? null,
    student_only: input.student_only ?? false,
    promo_code: promo,
    source_url: source,
    verified_at: today.toISOString().slice(0, 10),
    expires: input.expires ?? null,
    submitted_by: "community",
  };
  const parsed = Deal.safeParse(candidate);
  if (!parsed.success)
    return { ok: false, warnings, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };

  const yaml = stringify(parsed.data);
  const body = `<!-- Submitted via munchmap. Review before submitting: make sure nothing personal is included. -->\n\n\`\`\`yaml\n${yaml}\`\`\`\n`;
  const issue_url = `https://github.com/${repo}/issues/new?${new URLSearchParams({
    title: `[deal] ${parsed.data.brand}: ${parsed.data.title}`.slice(0, 120),
    labels: "new-deal",
    body,
  })}`;
  return { ok: true, warnings, errors: [], yaml, issue_url };
}
