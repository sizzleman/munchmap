# Privacy architecture

**Principle: personal data never has to leave the user's device in readable form. Only public deal facts are shared, and only when the user chooses.**

## Two kinds of data, kept strictly apart

| | Public deal facts | Personal data |
|---|---|---|
| Examples | "Antonio's: $3 slices Wednesdays" + source link | Your emails, notifications, campus, memberships, order history, personal promo codes, location |
| Where it lives | `data/` in the git repo (CC BY-SA) | Your device: `~/.munchmap/profile.json`, browser storage, your AI app |
| Who can read it | Everyone | Only you |
| How it gets shared | You review a prefilled submission and click submit | Never, unless you turn on encrypted sync (below) |

## Ingesting deals from emails, notifications and posts

### Phase 1 (works now): your AI reads your inbox, munchmap only gets the facts
1. You connect your email to **your own** AI app (the Gmail/Outlook connectors in Claude, ChatGPT and Gemini). munchmap never gets inbox access.
2. You run the MCP prompt **`find_deals_in_my_inbox`**. It tells your AI to extract only deal facts, keep personal offers private, and never pass raw email text to tools.
3. Public offers go through **`prepare_deal_submission`**, which runs locally and:
   - strips emails, phone numbers and order/receipt numbers (`scrubText`)
   - strips tracking parameters, and refuses email click-tracking links that can identify you (`cleanUrl`)
   - drops promo codes that look personal or single-use (`looksPersonalCode`)
   - validates against the schema
   - returns a **prefilled GitHub issue link**. Nothing is sent until **you** open it and click submit.
4. Personal offers ("20% off just for you, Sam") stay in your chat, and your AI combines them with public deals when it recommends.

Why not build our own Gmail integration? Google classes `gmail.readonly` as a *restricted scope*, which requires a paid third-party security assessment, and holding inbox tokens would make us a high-value target. Using the AI app you already trust avoids both.

### Phase 2: manual and share-sheet uploads
- Paste text, a link or a **screenshot** into the web app or a bot. Extraction runs locally (in-browser OCR or your own AI) and goes through the same scrub-and-review flow.
- Forwarding address (`deals@…`): **only** for the hosted version, processed in memory, deal facts extracted and the email discarded. Off by default, with clear disclosure.

### Phase 3: notifications
- **Android:** an optional open-source companion app that uses the NotificationListener API, filtered on-device to food apps the user picks. Only extracted deal facts are kept, and they stay on the device.
- **iOS:** Apple doesn't let apps read other apps' notifications. The options are the share sheet, screenshots, or Shortcuts automations the user sets up.

## A hosted version that is still private
Having the community "improve over time" only needs **public deal facts** to be centralized, and those are already public. Everything personal follows these rules:

1. **Local-first by default.** The profile lives on the device. The hosted web app works without an account.
2. **Optional end-to-end-encrypted sync** for using several devices:
   - The key is derived on the device (passphrase or passkey) and never sent to the server.
   - The profile is encrypted on the client with the standard WebCrypto API (AES-GCM) before upload. The server stores an opaque blob plus a random ID.
   - The user can export (decrypted JSON) or delete it at any time. Deletion is real; there are no backups of user blobs.
   - A free option: let users sync through their own storage (iCloud Drive, Google Drive, Dropbox), so we host nothing.
3. **No tracking.** No analytics SDKs and no ad IDs. If we ever need usage counts, we'd use self-hosted, cookie-free aggregate counts (e.g. Plausible-style), disclosed in the privacy policy.
4. **Anonymous submissions.** Deal submissions from non-GitHub users go through a small Cloudflare Worker (free tier). It runs the same scrubbing, rate-limits by IP *in memory only*, and opens a GitHub issue through a bot account. No IPs or identities are stored.
5. **Data minimization in logs.** Request logs (if any) drop IPs and query text, and are kept for 7 days at most.
6. **AGPL §13:** users of the hosted version can always get its exact source code, so they can verify all of the above.

## Ordering via AI / computer-use agents (Phase 3)
munchmap won't place orders itself or store payment details. Instead it produces an **order handoff**: the cheapest channel, a deep link, the items, and the promo to apply. The user's **own** agent can then run that handoff in the user's own logged-in browser session (Claude in Chrome, ChatGPT agent, Gemini/Project Mariner-style agents, Grok, etc.), stopping for the user's explicit confirmation before payment. This is the user using their own account. Some platforms' terms restrict automated use, so this stays opt-in, user-initiated, and documented as such.

## Legal checklist before the hosted version launches
- Privacy policy covering PIPEDA (Canada), CCPA/CPRA (California) and UAE PDPL (Federal Decree-Law 45/2021). Data minimization makes all of them simple.
- No collection from under-13s (COPPA); the target audience is college students.
- Terms of use: deals are community-sourced, so verify with the restaurant; no warranty.
