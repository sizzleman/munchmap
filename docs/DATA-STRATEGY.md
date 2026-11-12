# Data strategy: where munchmap's data comes from (and why)

The data is the product. The rule is: **use open data, build our own unique data, and link out (or let the user's own AI look) for everything else.** We never scrape platforms whose terms forbid it, and we never republish other people's reviews.

Last reviewed: 2026-11-12. Re-check the ⚠️ rows before building on them; terms and prices change.

## Sources

| Source | Status | What we use it for | How |
|---|---|---|---|
| **OpenStreetMap** | ✅ Live | Restaurant names, locations, cuisine, hours, diet tags, takeaway/delivery | Overpass API, live + weekly snapshots in `public/osm/` (ODbL, kept separate from `data/`) |
| **munchmap deal registry** (`data/*/deals`) | ✅ Live | Deals, student discounts, loyalty programs | Community submissions → bot PR → maintainer review |
| **munchmap places** (`data/*/places`) | ✅ Live | Menu prices (shown all-in) + student "worth it" ratings | Photo/receipt → the user's own AI → scrubbed → issue → bot PR |
| **Platform knowledge base** (`data/*/_national/platforms`) | ✅ Live | Membership prices and perks | Sourced YAML |
| **Overture Maps Places** | ⚠️ Planned | Fill gaps in OSM coverage | Open data (license to verify per release). Pre-extract per campus with DuckDB in CI |
| **Foursquare OS Places** | ⚠️ Planned | Same as Overture | Open dataset (Apache-2.0, verify) |
| **Google Maps** | 🔗 Links only · ⚠️ optional BYO key | Reviews, photos, popular times | Deep links for everyone. Planned: users or self-hosters add their **own** Places API key (their free tier), shown with Google attribution and never stored by us. No scraping (Google's terms forbid it). |
| **Yelp** | 🔗 Links only | Reviews | Its API is paid, which breaks our zero-cost rule |
| **Beli** | 🔗 Links + ✅ personal import | Your rankings and tastes | No public API. **Your own export** (privacy-law data request) or pasted lists are parsed on-device (Me → Import favourites) and boost "for you". Never uploaded. |
| **Delivery apps** (DoorDash, Uber Eats, Skip, talabat…) | 🔗 Links only | Ordering, their own ratings | No public consumer APIs, and their terms ban scraping |
| **Reddit, blogs, TikTok, Instagram** | 🔗 Via the user's own AI | "What do people say?" | MCP prompt `review_sweep`: the user's AI does its own web search, then summarizes and cites. munchmap stores nothing. |

## Why this beats one platform's rating
Every platform is skewed: Google by volume and noise, Beli by foodies, delivery apps by delivery experience and promotions. munchmap shows **sources side by side** instead of averaging them, and adds a signal nobody else has: **students rating value for money** ("worth it?", portions, student-friendliness).

## Personal data
Taste lists, profile, budget, memberships and AI keys live in the browser (`localStorage`) or `~/.munchmap/` for the local MCP. There are no accounts. Menu photos go straight from the user's device to the user's chosen model (local Ollama/Gemma by default) and are re-encoded first, which strips EXIF location. See `PRIVACY.md`.

## Adding a source
Follow `.claude/skills/add-adapter/SKILL.md`. The policy gate comes first: official API, open data, community, user-side, or deep link only. Then credit it in `THIRD_PARTY_NOTICES.md`.
