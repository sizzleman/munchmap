---
name: add-deal
description: Add or update a food deal, student discount, or loyalty program in the community data registry under data/. Use when someone shares a deal (text, URL, screenshot) or asks to add deals for a city or brand.
---

# Add a deal to the registry

## Inputs to collect

Brand/restaurant, city + country/region, what the deal is, channels it applies to (pickup, delivery, first-party site/app, which delivery apps), days/times, conditions (student ID, min order, promo code, membership), **source URL**, and expiry if known.

## Steps

1. **Check for duplicates:** search `data/<CC>/<region>/deals/` for the brand and a similar title. If it already exists, update `verified_at` (and any changed fields) instead of adding a new entry.
2. **Create the file** at `data/<CC>/<region>/deals/<deal-id>.yaml`, with an ID in the form `<cc>-<region>-<city>-<brand>-<slug>` (all lowercase, kebab-case):

   ```yaml
   id: ca-on-toronto-example-pizza-tuesday-large
   title: "$7.99 large 1-topping pizza on Tuesdays"
   brand: Example Pizza
   country: CA
   region: ON
   city: toronto                 # or "*" for region/country-wide
   channels: [pickup, first_party_app]   # pickup | delivery | first_party_site | first_party_app | doordash | ubereats | skip | grubhub | talabat | deliveroo | careem | noon | tgtg | other
   type: fixed_price             # percent_off | amount_off | fixed_price | bogo | free_item | free_delivery | membership_perk | loyalty | surplus
   value: { amount_minor: 799, currency: CAD }   # or { percent: 20 }
   schedule: { days: [tue], start: "11:00", end: "23:00", tz: America/Toronto }   # omit if always on
   conditions: "Pickup only. While supplies last."
   student_only: false
   promo_code: null
   source_url: https://example.com/deals
   verified_at: 2026-11-11
   expires: null                 # ISO date or null if recurring/ongoing
   submitted_by: github-handle
   ```
3. **Validate:** run `npm run validate:data` (or delegate to the `data-validator` subagent for a batch).
4. **Never make up data.** If you can't confirm a field from the source, leave it null or ask. Write titles in neutral language and copy no marketing text.
5. Commit with `data: add <brand> deal (<city>)`.

## Placement rules
- **Chain-wide or national programs** (e.g. a chain's student rewards program) go in **one** file at `data/<CC>/_national/deals/<cc>-national-<brand>-<slug>.yaml` with `region: "*"` and `city: "*"`. Never make one copy per city.
- Campus-specific deals list the campus slugs in `campuses: [...]` (see `region.yaml` for valid slugs).
- `source_url` must be a clean public URL: no `utm_`, `sfmc_`, or other tracking params, and no email redirect links. The validator rejects these.
- `verified_at` is the date the source confirms the deal is current, not the date you fetched it. If the newest source is old, use that older date.

## Bulk research

For "find deals in <city>", delegate to the `deal-researcher` subagent (Haiku) to draft entries. Every drafted entry needs a source_url, and a human checks the batch before merging.
