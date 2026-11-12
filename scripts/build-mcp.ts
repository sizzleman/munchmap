/**
 * Build the publishable `munchmap-mcp` npm package into dist/munchmap-mcp/:
 * one self-contained ESM file (deps bundled), so `npx munchmap-mcp` just works.
 * Publish (maintainers): npm run build:mcp && cd dist/munchmap-mcp && npm publish --access public
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

const root = join(import.meta.dirname, "..");
const out = join(root, "dist", "munchmap-mcp");
const { version } = JSON.parse(readFileSync(join(root, "packages/mcp-server/package.json"), "utf8"));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const [entry, file] of [
  ["packages/mcp-server/src/index.ts", "index.mjs"],
  ["packages/mcp-server/src/serve.ts", "serve.mjs"],
] as const) {
  await build({
    entryPoints: [join(root, entry)],
    outfile: join(out, file),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    banner: {
      js: "// munchmap — AGPL-3.0-or-later — https://github.com/sizzleman/munchmap\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
    legalComments: "linked",
    logLevel: "warning",
  });
}

writeFileSync(
  join(out, "package.json"),
  `${JSON.stringify(
    {
      name: "munchmap-mcp",
      version,
      description: "Find cheap food near campus from your own AI (Claude, ChatGPT, Gemini…). munchmap MCP server.",
      license: "AGPL-3.0-or-later",
      type: "module",
      bin: { "munchmap-mcp": "index.mjs", "munchmap-mcp-http": "serve.mjs" },
      files: ["index.mjs", "serve.mjs", "*.LEGAL.txt", "LICENSE", "README.md", "THIRD_PARTY_NOTICES.md"],
      engines: { node: ">=20" },
      repository: { type: "git", url: "git+https://github.com/sizzleman/munchmap.git" },
      homepage: "https://github.com/sizzleman/munchmap",
      keywords: ["mcp", "model-context-protocol", "food", "deals", "students"],
    },
    null,
    2,
  )}\n`,
);
for (const f of ["LICENSE", "README.md", "THIRD_PARTY_NOTICES.md"]) copyFileSync(join(root, f), join(out, f));
console.log(`Built dist/munchmap-mcp (v${version})`);
