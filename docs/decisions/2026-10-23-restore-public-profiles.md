<!-- markdownlint-disable MD013 -->

# Restore public profiles with nicknames

## Status

Accepted on 2026-10-23. Supersedes
[Remove public profile pages](2026-10-23-remove-public-profiles.md) and
restores the public-route part of
[007. Numeric public profile identities](007-numeric-public-profile-identities.md).

## Context

The owner wants every player to share their profile by a simple link, with no
separate switch: a profile is public as soon as the account exists. Two
addresses are wanted: the short numeric `/id/<n>/` and a nickname
`/u/<nickname>/` the player chooses in the account page.

Numeric IDs are sequential, so anyone can walk `/id/1/`, `/id/2/`, … and read
every profile. The design therefore treats each profile as published to
everyone and decides field by field what may be on it.

## Decision

- **One allow-listed projection.** `server/modules/publicProfile/model.ts`
  copies six fields out of a row: public ID, nickname, display name, avatar
  initials, registration month and whether a subscription is active. A test
  fails when a response carries any other key.
- **The display name is the nickname.** `users.name` is never read: sign-in
  fills it from a Discord global name or login, a Yandex login, a Boosty name,
  the local part of a mail address or `Telegram <id>`. Until the player picks
  a nickname the page says «Игрок #N».
- **No provider avatar.** Stored avatars are Telegram, Google or Discord image
  URLs; a Discord URL contains the Discord user ID and any of them lets the
  provider see who views the page. The profile shows initials of the nickname.
- **No contests.** Contest winners are published as HMAC pseudonyms and
  entries are private, so participation and wins are not public today and stay
  off the profile.
- **«Подписчик» without details.** Only `subscriptions.has_access`, read from
  the cache; level, price, source and dates stay private. Reading a profile
  never triggers a provider check.
- **Canonical `/id/<n>/`.** The numeric ID is immutable while nicknames
  change, so `/u/<nickname>/` redirects permanently to `/id/<n>/`, and the
  page's `rel=canonical` names `/id/<n>/`.
- **Nickname rules.** 3–24 characters after NFKC: Latin or Cyrillic letters
  (one alphabet per nickname), digits, `_`, `-`; at least one letter. The
  uniqueness key folds case and look-alike characters (Cyrillic `а`/Latin
  `a`, `0`/`o`, `1`/`i`/`l`, `-`/`_`). Route segments, system words and
  brand/staff fragments (`admin`, `moderator`, `hearthpulse`, `manacost`, …)
  are reserved. A content filter hook exists; no profanity list is shipped.
- **Changes.** One change per 30 days (a case-only change is free). A released
  nickname redirects to its last owner and cannot be taken by anyone else for
  90 days. The claim runs in `BEGIN IMMEDIATE` with a unique index on the key.
- **Indexing.** Profiles are `noindex, follow` and not in the sitemap: there is
  no public user content yet. When saved decks or similar content appear, a
  profile with such content may become indexable in its own decision.

## Threat model

| Threat | Mitigation |
| --- | --- |
| Enumerating all profiles through sequential IDs | Only harmless fields exist on a profile. Express limits direct API reads to 60 per minute per client; Nginx limits `/id/` and `/u/` documents per client. |
| Leaking identities or contact data (mail, Telegram, Discord, Yandex, Google, Patreon, Boosty) | Allow-listed projection; `users.name` and provider avatars are never read; test with poisoned rows. |
| Leaking payment data | Only a boolean; no level, price, source or dates. |
| Learning that an account is blocked or the internal ID | Missing, blocked and malformed IDs share one `404` body; `users.id` never leaves the server. |
| Impersonating staff, the brand or another player | Reserved words, brand fragments, single-alphabet rule, look-alike folding in the uniqueness key, 90-day hold of released nicknames. |
| Stored XSS through the nickname | The character set excludes markup; React and Next metadata escape the text anyway. |
| Forged nickname change from another site | `PUT /api/account/public-profile/nickname` passes the site-wide same-origin rule and requires `X-CSRF-Request: 1`; the route checks it again. |
| Two players claiming one nickname at once | `BEGIN IMMEDIATE` plus the unique index; a lost race answers `409`. |
| Probing which nicknames exist | Lookups answer only the public ID, which the profile already shows; nickname changes are limited to 10 per 15 minutes per client. |
| Viewer data in a shared cache | Profile reads go through the anonymous `fetchPublicExpress()` (no cookies); API answers carry `public, max-age=60` and no viewer fields; documents stay `no-store`. |

## Consequences

- Every existing account has a public page at once. Players who do not want a
  name on it simply do not set a nickname; the page then shows only
  «Игрок #N», the registration month and the subscriber badge.
- Old shared `/profiles/p_…/` links stay a `404`.
- Removing the feature again means removing the routes and pages; the nickname
  columns and history table are additive and may stay.
