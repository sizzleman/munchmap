# Security policy

## Reporting a vulnerability
Please **don't open a public issue** for security or privacy problems.
Report them privately through GitHub: **Security tab → "Report a vulnerability"** on this repository.

We aim to acknowledge reports within 72 hours. This is a volunteer project, so please be patient. We'll credit you in the release notes unless you'd rather stay anonymous.

## Especially in scope
- Any way personal data (emails, location, profile, promo codes) could leak through `prepare_deal_submission`, the scrubbing helpers in `packages/core/src/privacy.ts`, logs, or submissions
- Injection via data files or tool inputs (for example a malicious `source_url` or Overpass query)
- Prompt-injection content in `data/` that tries to steer users' AI agents
- Secrets accidentally committed to the repo

## Supported versions
Only the latest `main` is supported during the 0.x phase.
