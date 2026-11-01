# Web replays

## Objective

A player of the Hearthpulse desktop app puts one finished game on the site by
pressing «Загрузить на сайт» on its card and confirming. Anyone with the link
`/replay/<id>` sees the summary and a turn-by-turn timeline, as the player saw
the game. The player deletes it from the app or the account page; it is
deleted on its own after 180 days and with the account.

## Data

Table `replay_shares` (`server/modules/replayShares/repository.ts`), created
at start: `id` (10 base62 characters), `user_id` (FK `users`, `ON DELETE
CASCADE`), `kind` (`constructed` | `battlegrounds`), `created_at` (epoch ms),
`header_json` (the rebuilt header), `body_gzip` (the sanitized file),
`delete_token_hash` (sha256 of the delete token; the token itself is handed
out once). No IP address, device or name is stored.

Limits: 200 replays per account (`REPLAY_MAX_PER_ACCOUNT`), kept 180 days
(`REPLAY_KEEP_DAYS`): the prune runs at each upload, a minute after start and
once a day (where `BACKGROUND_JOBS_ENABLED` is not `0`).

## What is stored

The app sends its Share copy without the post-game lines. The server does not
trust it and rebuilds the file (`sanitize.ts`):

- event lines must match the app's grammar of their kind (records, zones
  `PLAY|GRAVEYARD|HAND|SECRET`, tags and card types from fixed lists); card
  ids must look like card ids;
- Constructed: the opponent's hand and secrets become card backs (`E <id> O
  HAND <pos> - -`), their `V` lines are dropped, `N`/`K` are dropped;
- Battlegrounds: Bob's offer leaves view when combat starts, the combat
  opponent by the next tavern; lines about cards out of view are dropped;
- the header is rebuilt field by field: `mode`, `result`, `format`,
  `gameType`, classes and tribes from fixed lists, `startedAt` as the date
  only (`YYYY-MM-DDT00:00:00Z`), the deck code only when it is a deckstring,
  the opponent's archetype only when the site knows it; no ranks, ratings or
  names;
- the Battlegrounds `G` line keeps only the app's keys (rounds: turn, tier,
  health, boards, opponent hero, shop, result, damage; lobby: hero, place,
  local).

Limits: 512 KB gzip, 8 MB text, 100 000 lines, 512 characters a line.

## API

- `POST /api/v1/tracker/replays` — Bearer `tracker.write`; body `{"v":1,
  "hpr":"<base64 gzip>"}` → 201 `{ id, url, deleteToken, events }`. 401
  without a token, 403 without the scope, 400 not a replay or a refused line,
  413 too large, 409 the account keeps 200, 429 more than 20 uploads an hour
  from one address.
- `DELETE /api/v1/tracker/replays/:id` — `X-Delete-Token`, or the owner's
  Bearer → 204; otherwise 404. Not counted by the upload limit.
- `GET /api/v1/replays/:id` — public, `Cache-Control: private, no-store`,
  `X-Robots-Tag: noindex` → `{ id, kind, createdAt, header, text, cardNames }`
  (Russian names by card id); 404 unknown, deleted or expired. 120 a minute
  from one address; the site's own page (loopback) is not limited. The server
  keeps the last 32 answers in memory; a delete or prune drops them.
- `GET /api/account/replays`, `DELETE /api/account/replays/:id` — the site
  session (CSRF rules of `/api/account`): the list (no files) and deleting.
- The account's data export (`GET /api/account/tracker-data/export`) carries
  `replays: [{ id, kind, createdAt, header, text }]` after `events`.

## Pages

- `/replay/<id>`: `noindex`; mode and result in Russian
  (`src/shared/text/replayLabels.ts`), the opponent's hero and archetype, the
  Battlegrounds final board, the timeline in `<details>`; a card only by its
  known name («неизвестная карта» otherwise). Unknown id → 404; the API busy
  or down → «Реплей временно недоступен».
- Account, «Реплеи на сайте»: the list with links and «Удалить» (asks first);
  a failed load shows an error with «Повторить».

## Privacy

`src/modules/legalPages/content.json`, section 7: explicit upload only, what
a replay holds (cards and moves as seen, heroes, result, date without time,
the player's deck code), what it does not (names, BattleTag, ranks, rating,
unseen opponent cards), public by link and not in search, 180 days, deleting.
