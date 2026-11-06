# Embeds, oEmbed and link previews

## Objective

Every shared Hearthpulse link advertises the app: a rich preview in chats
(Telegram, Discord, VK, X), an iframe on other sites (hs-manacost.ru articles,
forums) and a «Сделано в Hearthpulse» link back to the download landing.

## URLs

| URL | Owner | Answer |
| --- | --- | --- |
| `/og/replay/<id>/` | Next route handler | 1200 × 630 JPEG: heroes, result, Battlegrounds board, brand |
| `/og/year/<publicProfileId>/<year>/` | Next route handler | JPEG of the year in review ([spec](year-in-review.md)) |
| `/embed/replay/<id>/` | Next route handler | HTML for an iframe (600 × 360 suggested) |
| `/embed/deck/<code>/` | Next route handler | HTML: deck list by cost, mana curve 0…7+, «Скопировать код» (380 × 760 suggested) |
| `/embed/oembed/?url=…` | Next route handler | oEmbed 1.0 JSON |
| `/download/` | Next page | landing: what it is, three screenshots, downloads, RU/EN |

`<id>` is the ten-character replay id. `<code>` is a deckstring; its `/` may
be raw or `%2F`, `+` may arrive as a space. The deck is resolved by the site's
public `/api/deck/resolve` (card names in Russian, HearthstoneJSON art through
`/api/card-image/<id>/tile.webp`; ADR 0009: art stays free).

## Embed documents

- Hand-written HTML without React, site scripts or analytics
  (`apps/public-web/lib/embedDocument.ts`). Every value is escaped.
- `Content-Security-Policy: default-src 'none'; img-src 'self' data:;
  style-src 'unsafe-inline'; script-src 'sha256-…'; base-uri 'none';
  form-action 'none'; frame-ancestors *`. The only script is the copy button
  (its hash is computed at module load).
- No `X-Frame-Options`: origin Nginx routes `/embed/…` through a location
  without the shared SAMEORIGIN snippet and hides any upstream one; the edge
  has `location ^~ /embed/` without SAMEORIGIN and without the document cache.
- `X-Robots-Tag: noindex`. Replay embeds send `Cache-Control: no-cache` (a
  replay its author deleted disappears at once, then shows «Реплей не
  найден»); deck embeds `public, max-age=3600`.
- Footer: «Сделано в Hearthpulse» → `/download/`, «Открыть на hearthpulse.net»
  → the replay page (or the standalone deck embed).

## oEmbed

`GET /embed/oembed/?url=<URL>[&maxwidth=N][&maxheight=N][&format=json]`

- `url` must be `https://hearthpulse.net/replay/<id>/`,
  `https://hearthpulse.net/embed/replay/<id>/` or
  `https://hearthpulse.net/embed/deck/<code>/` (also `www.`); anything else →
  404 `{ "error": … }`. `format` other than `json` → 501.
- 200: `{ version: "1.0", type: "rich", provider_name: "Hearthpulse",
  provider_url, title, html, width, height }`; replays add `thumbnail_url`
  (the preview image, 1200 × 630). `html` is one `<iframe loading="lazy">`.
  Width is at most 600 (replay) / 380 (deck) and at least 280; height at most
  360 / 760 and at least 240.
- `Access-Control-Allow-Origin: *`. A busy API → 503.
- Replay pages link the endpoint with `<link rel="alternate"
  type="application/json+oembed">`, so consumers that discover oEmbed need no
  registration.

## Privacy

Previews and embeds read the same sanitized replay as the page
([web replays](web-replays.md)): heroes and cards by their card names, mode,
result, turns, the date without time. No player names, BattleTag, account id
or rank. Deck embeds show only what the code holds.

## WordPress

Setup for hs-manacost.ru and other WordPress sites:
[runbook](../runbooks/embeds-wordpress.md).
