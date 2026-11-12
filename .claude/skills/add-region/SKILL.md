---
name: add-region
description: Add support for a new country, state/province, or city (platforms available, currency, tax, tipping norms, seed deals). Use when expanding coverage beyond existing regions.
---

# Add a region

A region should be **data only**. If this needs code changes in `core`, fix the abstraction first (AGENTS.md rule 6).

## Steps

1. Create `data/<CC>/region.yaml` (country) and/or `data/<CC>/<region>/region.yaml`:

   ```yaml
   country: AE
   region: DU            # ISO 3166-2 subdivision code suffix
   name: Dubai
   currency: AED
   timezone: Asia/Dubai
   tax: { rate_bps: 500, included_in_menu_price: true }   # basis points; VAT 5% example — verify!
   tipping: { customary: false, default_percent: 0 }
   platforms: [talabat, deliveroo, careem, noon, keeta]   # verify what actually operates there
   student_programs: []  # e.g. ISIC, UNiDAYS
   ```
2. Add `data/<CC>/<region>/platforms/<platform>.yaml` for fee structure and memberships (delivery fee ranges, service fee %, small-order fee, membership price and perks). Cite a `source_url` and `verified_at` for each one.
3. Seed at least 10 real deals with the `add-deal` skill. The `deal-researcher` subagent can draft them.
4. Add the effective-price test cases for this region to `packages/core` tests (tax-inclusive vs. exclusive, tipping norms).
5. `npm run validate:data && npm test`.
6. Add a `LESSONS.md` entry under `region:<CC>` for anything locally unusual (e.g. tax-inclusive menus, cash-on-delivery norms).

## Verify, don't assume

Tax rates, fee structures and which apps operate in a city change often and differ by city. Every number needs a source.
