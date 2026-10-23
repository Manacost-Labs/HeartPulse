<!-- markdownlint-disable MD013 -->

# Public profiles and nicknames

Every account has a public profile. There is no switch: the profile exists as
soon as the account has its numeric ID. Decision and threat model:
[Restore public profiles with nicknames](../decisions/2026-10-23-restore-public-profiles.md).

## Public fields

`GET /api/profiles/:publicProfileId` answers `{ profile }` with exactly these
keys (`PUBLIC_PROFILE_FIELDS` in `server/modules/publicProfile/model.ts`):

| Field | Value |
| --- | --- |
| `publicProfileId` | The numeric ID as a string, `"1"` to `"2147483647"`. |
| `nickname` | The chosen nickname in its display form, or `null`. |
| `displayName` | The nickname, or `Игрок #N` when none is set. |
| `avatarInitials` | The first two characters of the nickname in upper case, or `#`. |
| `memberSince` | Registration month, `YYYY-MM`. |
| `isSubscriber` | `true` while the cached subscription grants access. |

Never public: the account name (`users.name`), mail addresses, contacts for
prizes, Telegram/Discord/Yandex/Google/Patreon/Boosty identities, avatars from
those providers, subscription level/price/source/dates, role and admin flags,
the internal account ID, sessions, IP addresses, newsletter and consent state,
contest entries and wins.

Missing, blocked, malformed and out-of-range IDs all answer `404` with
`{ "error": "Профиль не найден" }`. Successful and `404` answers carry
`Cache-Control: public, max-age=60`; a database failure answers `503` with
`no-store`.

## Nicknames

`GET /api/profiles/by-nickname/:nickname` answers `{ publicProfileId }` for the
current holder of the nickname, or for its last holder within 90 days after a
change; otherwise the same `404`. Lookups are case- and look-alike-insensitive.

Rules for a new nickname (`server/modules/publicProfile/nickname.ts`):

- NFKC-normalized and trimmed; 3–24 characters;
- only `a–z`, Cyrillic letters (`а–я`, `ё`, `і`, `ї`, `є`, `ґ`, `ў`), digits,
  `_` and `-`; letters of one alphabet only; at least one letter;
- not a reserved word (every top-level route segment, `admin`, `root`, `null`,
  `support`, …) and without a brand/staff fragment (`admin`, `moderator`,
  `hearthpulse`, `manacost`, `official`, `support` and Russian equivalents);
- unique by key: lower case with look-alikes folded (Cyrillic `а е о р с у х
  к м н т в і`, `0`→`o`, `1`/`i`→`l`, `-`→`_`, …);
- an optional content check (`nicknameContentAllowed`) may refuse it; none is
  configured today.

## Owner endpoints

Both need a signed-in session and answer `Cache-Control: private, no-store`.

`GET /api/account/public-profile` →
`{ publicProfileId, nickname, nicknameChangeAvailableAt, profilePath }`.
`nicknameChangeAvailableAt` is an ISO time or `null` when a change is possible
now; `profilePath` is `/id/<n>/`.

`PUT /api/account/public-profile/nickname` with `{ "nickname": "…" }`:

| Status | Meaning |
| --- | --- |
| `200` | Saved; the body is the owner payload above plus `success: true`. |
| `400` | Invalid; `reason` is `length`, `characters`, `mixed-script`, `needs-letter`, `reserved` or `content`, `error` is the Russian message. |
| `401` | No session. |
| `403` | Cross-site request or missing `X-CSRF-Request: 1`. |
| `409` | `reason: "taken"`: held by another account or within another account's 90-day hold. |
| `429` | `reason: "cooldown"` with `availableAt`, or the per-client limit of 10 attempts per 15 minutes. |

A real change starts a 30-day cooldown and moves the previous nickname into
`public_nickname_history` for 90 days. Changing only the letter case is free.

## Pages

- `/id/<n>/` (`apps/public-web/app/id/[publicProfileId]/page.tsx`) renders
  the card on the server from the anonymous projection (`lib/publicProfile.ts`
  reads it through `fetchPublicExpress()` without cookies and copies only the
  contract's fields). Missing and blocked profiles are the site's `404`.
  Metadata: title `<displayName> — профиль игрока | HearthPulse`,
  `robots: noindex, follow`, `rel=canonical` to `https://hearthpulse.net/id/<n>/`,
  Open Graph `profile` with the site share image (there are no profile images)
  and a large Twitter card, so links preview in Telegram and Discord.
  Profiles are not in the sitemap.
- `/u/<nickname>/` is answered in `apps/public-web/proxy.ts`: an existing
  nickname gets a `301` to `/id/<n>/` (`Cache-Control: public, max-age=60`),
  anything else falls through to the page's `404`.
- The account page (`/?login`) has a «Публичный профиль» section
  (`AccountPublicProfile`): the short link and, once chosen, the nickname link,
  each with «Скопировать ссылку», and the nickname form with the rules and the
  date of the next allowed change.

## Limits

Direct API reads of `/api/profiles/*` are limited to 60 per minute per client
on top of the general API budget. Loopback reads by the Next server are not
counted there; the documents are limited in Nginx instead: `/id/<n>/` and
everything under `/id/`, `/profiles/` and `/u/` share the
`arena_public_profiles` zone (`deploy/nginx/arena-seo-map.conf`), 30 requests
per minute per visitor address with a burst of 20; the excess answers `429`.
The profile namespace stays `no-store` at the origin, so the edge does not
cache profile documents.

## Data

`users.nickname`, `users.nickname_key` (unique index) and
`users.nickname_changed_at`, plus `public_nickname_history(nickname_key,
user_id, released_at)`. `ensurePublicProfileSchema()` adds them idempotently at
start; nothing existing is rewritten.

## Tests

`npm run test:public-profiles`: numeric ID migration, nickname rules and
projection allow-list (`tests/public-profile-nickname.test.ts`), and the routes
on a real SQLite database (`tests/public-profile-routes.test.ts`: allow-list,
`404` parity, CSRF, validation, uniqueness, cooldown, hold, race, rate limit).
`tests/next-public-profiles-browser.test.mjs` runs Express and Next together:
the account section sets a nickname, copies the link and refuses a change
without the CSRF header; `/u/` redirects, `/id/` shows only public fields with
the right metadata, has no axe violations or overflow at 320–1440 px, and a
blocked account becomes a `404`. Stories: `Identity/Public Profile` and
`Identity/Account Public Profile`.
