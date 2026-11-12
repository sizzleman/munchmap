# Licensing: options, trade-offs, and what munchmap uses

**Decision (2026-11-12):** code is **AGPL-3.0-or-later**, data is **CC BY-SA 4.0**, and contributions are accepted under the **DCO** (no CLA).
Nobody outside the project has contributed yet, so this can still change for free. Once outside contributions land, changing the license means getting every contributor's consent.

> This is not legal advice. It's the standard reasoning open-source projects use; for anything commercial, talk to a lawyer.

## The question that decides it
> "Do I care if someone takes munchmap, makes it closed-source, and runs it as their own hosted app?"

- **No, maximum adoption is the goal** → a permissive license (MIT or Apache-2.0)
- **Yes, improvements to hosted versions should come back to everyone** → AGPL-3.0

Because you plan to run a **hosted version** and want the project to stay free and open, the AGPL is the better fit.

## Code licenses compared

| License | Type | Can others make a closed-source fork? | Must hosted (SaaS) forks share source? | Patent grant | Good for | Watch out for |
|---|---|---|---|---|---|---|
| **MIT** | Permissive | ✅ Yes | ❌ No | ❌ Implicit only | Max adoption, libraries | A company can take it closed and compete with no obligations |
| **Apache-2.0** | Permissive | ✅ Yes | ❌ No | ✅ Explicit | Corporate-friendly projects | Same as MIT, with more paperwork (NOTICE file) |
| **MPL-2.0** | Weak copyleft (file level) | Partly: modified *files* stay open | ❌ No | ✅ | Libraries that want changes to stay open | Easy to work around in a hosted service |
| **GPL-3.0** | Strong copyleft | ❌ No (if distributed) | ❌ No: the "SaaS loophole" | ✅ | Desktop and CLI apps | Doesn't cover software that is only run as a web service |
| **AGPL-3.0** ⭐ | Network copyleft | ❌ No | ✅ **Yes**: if users interact with a modified version over a network, they get its source | ✅ | **Hosted apps that should stay open** (used by Mastodon, Nextcloud, Plausible, Grafana) | Some companies ban AGPL internally, so a few contributors may skip it. Libraries that import AGPL code inherit it. |
| BSL / FSL / Elastic / SSPL | "Source-available" | ❌ | Restricts competing services | varies | Startups protecting a business | **Not OSI open source.** It would conflict with "free and open for everyone." ❌ |

### What AGPL means for each group
- **Students using munchmap** (web, MCP, self-hosted): no obligations at all.
- **Contributors**: their code is AGPL too. They keep their copyright.
- **You running the official hosted version**: no restrictions. You're the copyright holder and you're publishing the source anyway.
- **Someone running a modified copy as a public service**: they must offer their modified source to their users. This is the protection you want.
- **Someone wanting to embed munchmap code in a closed app**: they can't. That's intentional.

### When to choose MIT instead
Choose MIT if you'd rather maximize how many apps embed munchmap's code and you don't mind closed forks. A common middle ground is to put the reusable library (`packages/core`) under **Apache-2.0** and the app and server under **AGPL**. We can split the licenses this way later. Loosening a license is easy; tightening it after contributions arrive is hard.

## Data licenses compared

| License | Share-alike? | Attribution? | Notes |
|---|---|---|---|
| CC0 | No | No | Public-domain dedication. Maximum reuse, including closed reuse. |
| CC BY 4.0 | No | Yes | Reuse anywhere with credit |
| **CC BY-SA 4.0** ⭐ | **Yes** | Yes | Improvements to the data stay open; this is what Wikipedia uses. Covers database rights. |
| ODbL 1.0 | Yes (database) | Yes | Built for databases (OSM uses it). It's heavier and distinguishes "produced works" from databases. |

We use **CC BY-SA 4.0** so a competitor can't take the community-built deal database closed.
**OSM data stays separate**: we query it live and don't store it in `data/`, so ODbL's share-alike doesn't spread into our registry. We only need to show "© OpenStreetMap contributors".

## Contributions: DCO, not a CLA
- **DCO (Developer Certificate of Origin)**: contributors add `Signed-off-by:` to commits (`git commit -s`), certifying they have the right to submit the code. It's lightweight and used by Linux and GitLab. ✅
- **CLA**: contributors sign an agreement that usually lets the maintainer relicense, for example to a proprietary license. It's heavier, puts off contributors, and you don't need it since you're not planning a paid version.
- **The trade-off:** with DCO + AGPL, **no one, including you, can later relicense other people's contributions as proprietary.** That's a feature: it's a promise to the community that munchmap stays open.

## Can a centralized hosted version still protect people's data?
Yes. The license controls the *code*; privacy comes from the *architecture*. See `docs/PRIVACY.md`. In short, personal data stays on the user's device or is end-to-end encrypted, so the server only ever sees public deal facts and encrypted blobs it can't read.

## Compliance checklist (enforced in CI where possible)
- [x] `LICENSE` (AGPL-3.0 full text) at the repo root; `"license": "AGPL-3.0-or-later"` in every package.json
- [x] `data/LICENSE` (CC BY-SA 4.0) and the full legal text
- [x] `THIRD_PARTY_NOTICES.md` listing dependencies, data sources, adapted docs and trademarks
- [x] `npm run licenses:check` in CI blocks incompatible dependency licenses
- [x] OSM attribution in every tool response that uses OSM data
- [ ] SPDX header in source files (`// SPDX-License-Identifier: AGPL-3.0-or-later`); can be added with a script before launch
- [ ] Hosted version: a visible "Source code" link in the footer (AGPL §13 requires offering source to network users)
- [ ] DCO GitHub App (free) once the repo is public
