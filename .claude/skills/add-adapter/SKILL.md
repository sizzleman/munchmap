---
name: add-adapter
description: Implement a new data source adapter in packages/sources (e.g. OSM, a restaurant chain's public deals page, a platform fee knowledge base, an official API). Use when adding any new way of getting restaurant, price, or deal data.
---

# Add a source adapter

## 1. Policy gate (do this first)

Decide the `access_method` and stop if it isn't allowed:

- `official_api`: documented, public, free API whose terms allow this use ✅
- `open_data`: openly licensed data (e.g. OSM/ODbL) ✅ with attribution
- `community`: the git data registry ✅
- `user_side`: runs only on the user's device or session (browser extension, user-pasted content) ✅
- `deep_link_only`: we only build links into the app or site ✅
- Server-side scraping of delivery platforms ❌. Don't build it. Suggest `user_side` or `deep_link_only` instead.

Paid or credit-card-required APIs ❌ (AGENTS.md rule 1).

## 2. Scaffold

```
packages/sources/<adapter-id>/
  src/index.ts        export const adapter: SourceAdapter = { id, accessMethod, regions, attribution?, fetch }
  src/schema.ts       Zod schema for raw responses → map to core types
  src/__fixtures__/   recorded sample responses (fake/sanitized)
  src/index.test.ts   tests against fixtures; no live network in tests
  README.md           what it provides, limits, rate-limit, license/attribution
```

## 3. Requirements

- Validate raw responses with Zod and map them to `core` types. Money goes in minor units + a currency code.
- Cache results and rate-limit. Send a generic User-Agent with no personal info.
- Handle failure gracefully: return empty results plus a warning, never crash the MCP server.
- Register the adapter in the sources index and list it in the README's sources table.

## 4. Done

`npm run lint && npm test` pass. If anything about the source's behaviour was surprising, add a `LESSONS.md` entry under area `sources`.

Heavy implementation can be delegated to the `adapter-builder` subagent; run `pr-reviewer` on the result.
