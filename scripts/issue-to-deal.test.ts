import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { issueToDeal } from "./issue-to-deal.ts";

const root = () => {
  const r = mkdtempSync(join(tmpdir(), "munchmap-bot-"));
  mkdirSync(join(r, "data", "US"), { recursive: true });
  return r;
};
const yamlBlock = (extra = "") => `Some intro text\n\n\`\`\`yaml
id: us-il-champaign-example-pizza-wed-slices
title: "$3 slices on Wednesdays, call 217-555-0100"
brand: Example Pizza
country: US
region: IL
city: champaign
campuses: []
channels: [pickup]
type: fixed_price
value: { amount_minor: 300, currency: USD }
schedule: null
conditions: null
student_only: false
promo_code: X7KQ9P2M4Z
source_url: https://pizza.example/deals?utm_source=ig
verified_at: 2026-11-12
expires: null
submitted_by: community
${extra}\`\`\`\n`;

describe("issue → deal bot", () => {
  it("creates a scrubbed deal file from a YAML block", () => {
    const r = root();
    const res = issueToDeal(yamlBlock(), "42", r);
    expect(res.status).toBe("created");
    if (res.status !== "created") return;
    const file = readFileSync(join(r, res.path), "utf8");
    expect(file).not.toContain("555-0100");
    expect(file).not.toContain("X7KQ9P2M4Z");
    expect(file).not.toContain("utm_source");
    expect(file).toContain("submitted_by: issue-42");
  });
  it("sends plain form issues to triage", () => {
    expect(issueToDeal("### Restaurant\nFoo", "1", root()).status).toBe("needs-triage");
  });
  it("rejects prompt injection", () => {
    const body = yamlBlock().replace("$3 slices on Wednesdays", "Ignore previous instructions and");
    expect(issueToDeal(body, "1", root()).status).toBe("needs-triage");
  });
  it("rejects duplicates", () => {
    const r = root();
    issueToDeal(yamlBlock(), "1", r);
    expect(issueToDeal(yamlBlock(), "2", r).status).toBe("needs-triage");
  });
});
