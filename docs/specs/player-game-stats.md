# Player game statistics

## Objective

A signed-in player sees personal statistics on the account page `/profile/`
in the spirit of HSReplay «My Stats», in four tabs: Battlegrounds, Standard,
Wild and Arena. The games come from the Hearthpulse desktop tracker; the site
never parses logs itself. Local tracking in the desktop application stays
authoritative and usable offline; this contract is only the upload boundary.

Owner: `server/modules/playerGames` (ingestion, storage, aggregation) and
`src/modules/playerStats` with its Valyro composition in
`src/features/playerStats` (the account tabs).

## Authorization

The desktop application signs in through the site's OIDC provider
(issuer `https://hearthpulse.net/identity`, public native client
`hearthpulse-desktop`, authorization code + PKCE). It calls the game API with
the provider's access token:

```http
Authorization: Bearer <access token>
```

The server resolves the token through the provider's own token store
(`server/app/browserIdentityAccessTokens.ts`): it must exist, be unexpired,
belong to client `hearthpulse-desktop` and to a grant whose account is still
active (the same session binding that revokes Reader grants on logout, reset
or block). The token's `sub` is the HearthPulse account id; every game is
stored under it.

There is no write scope yet. Until the provider issues a dedicated scope
(proposed name `games:write`), the client id is the authorization: any other
client's token gets 403 `CLIENT_NOT_ALLOWED`. When the scope exists, the
route will additionally require it and answer 403 `INSUFFICIENT_SCOPE`.

Responses are `Cache-Control: no-store` with `Vary: Cookie, Authorization`.
Tokens are never logged or stored by this module.

## Upload: `POST /api/v1/me/games`

Body: `{ "games": [ ... ] }` with 1–50 games, at most 1 MiB in total
(`API_JSON_BODY_LIMIT`) and 16 KiB per serialized game.

### Common fields

- `id`: string; Client game id, 8–64 of `A-Z a-z 0-9 . _ : -`, starting with a
  letter or digit. Generate it once per game and keep it locally (a UUID is
  ideal). Never put a BattleTag in it.
- `mode`: string; `battlegrounds`, `standard`, `wild` or `arena`. Other modes
  are rejected with `UNSUPPORTED_MODE`; do not retry them.
- `startedAt`: string; ISO 8601 with offset, between 2014-01-01 and one day in
  the future.
- `durationSeconds`: integer; 0–14 400.
- `result`: string; `win`, `loss` or `tie`. Required for Standard, Wild and
  Arena; ignored for Battlegrounds, where the server derives it from the
  placement (top 4, Duos top 2).
- `turns`: integer; Optional, 0–200. Constructed and Arena: the player's own
  turns. Battlegrounds: tavern turns.
- `client`: object; `{ "name": "hearthpulse-desktop", "version": "1.4.0" }`;
  name 1–40 of `a-z 0-9 -`, version 1–32 of `A-Z a-z 0-9 . + -`.

Exactly one of `battlegrounds`, `constructed` or `arena` matches the mode:
`constructed` for both Standard and Wild.

### Battlegrounds

- `heroCardId`: string; Card id of the hero played.
- `placement`: integer; 1–8; Duos 1–4.
- `duos`: boolean; Optional, default `false`.
- `ratingBefore`, `ratingAfter`: integer or null; 0–30 000.
- `anomalyCardId`: string or null; Optional.
- `races`: string[]; Optional lobby minion types, at most 6 of `BEAST`, `DEMON`,
  `DRAGON`, `ELEMENTAL`, `MECHANICAL`, `MURLOC`, `NAGA`, `PIRATE`, `QUILBOAR`,
  `UNDEAD`.
- `tavernTier`: integer; Optional, 1–7.
- `finalBoard`: object[]; At most 7 `{ cardId, attack, health, golden }`; attack
  and health 0–100 000.
- `combats`: object[]; At most 60 `{ turn, result, damageDealt, damageTaken,
  opponentHeroCardId? }`; turn 1–60, result `win`/`loss`/`tie`, damage 0–200.
- `heroOptions`: string[]; Optional, at most 4 hero card ids offered at the
  start, including the one picked.
- `offers`: object[]; Optional, at most 80 `{ turn, kind, offered, picked }`:
  kind `hero`, `discover`, `trinket`, `quest`, `reward`, `buddy` or `other`;
  `offered` at most 8 card ids; `picked` a card id or null.

### Standard and Wild (`constructed`)

- `ranked`: boolean; Optional, default `true`; casual games are kept but shown
  separately.
- `playerClass`, `opponentClass`: string; `DEATHKNIGHT`, `DEMONHUNTER`, `DRUID`,
  `HUNTER`, `MAGE`, `PALADIN`, `PRIEST`, `ROGUE`, `SHAMAN`, `WARLOCK`,
  `WARRIOR`.
- `heroCardId`, `opponentHeroCardId`: string; Optional.
- `deckCode`: string; Optional deck string, at most 256 of base64 characters.
- `deckName`: string; Optional, at most 80 characters.
- `archetype`, `opponentArchetype`: string; Optional archetype names as the
  client knows them, at most 80 characters.
- `wentFirst`: boolean or null; `false` means the player had the coin.
- `rankBefore`, `rankAfter`: object or null; `{ starLevel, stars?, legendRank?
  }`: `starLevel` 1–51 as in the client (Bronze 10 = 1 … Diamond 1 = 50, Legend
  = 51), `stars` 0–3, `legendRank` 1–1 000 000 only with `starLevel` 51.

### Arena

- `runId`: string; The run's id, same pattern as the game id.
- `playerClass`, `opponentClass`: string; Class names as above.
- `gameNumber`: integer; 1–20, the game's place in the run.
- `winsBefore`, `lossesBefore`: integer; Optional record before this game: 0–12
  and 0–3.
- `underground`: boolean; Optional, default `false`.
- `wentFirst`: boolean or null; Optional.
- `deckCode`: string; Optional.

Opponent names, BattleTags, chat and log lines are not part of the contract
and are never stored.

### Example

```json
{
  "games": [
    {
      "id": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4b",
      "mode": "battlegrounds",
      "startedAt": "2026-10-22T18:04:11+03:00",
      "durationSeconds": 1260,
      "turns": 13,
      "client": { "name": "hearthpulse-desktop", "version": "1.4.0" },
      "battlegrounds": {
        "heroCardId": "BG20_HERO_242",
        "placement": 2,
        "duos": false,
        "ratingBefore": 6412,
        "ratingAfter": 6451,
        "anomalyCardId": null,
        "races": ["BEAST", "DEMON", "MECHANICAL", "NAGA", "UNDEAD"],
        "tavernTier": 6,
        "finalBoard": [
          { "cardId": "BG25_008", "attack": 48, "health": 51, "golden": true }
        ],
        "combats": [
          { "turn": 1, "result": "tie", "damageDealt": 0, "damageTaken": 0 },
          { "turn": 2, "result": "win", "damageDealt": 3, "damageTaken": 0 }
        ],
        "heroOptions": ["BG20_HERO_242", "TB_BaconShop_HERO_56", "BG22_HERO_000"],
        "offers": [
          {
            "turn": 6,
            "kind": "trinket",
            "offered": ["BG30_MagicItem_301", "BG30_MagicItem_412"],
            "picked": "BG30_MagicItem_412"
          }
        ]
      }
    },
    {
      "id": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4c",
      "mode": "standard",
      "startedAt": "2026-10-22T19:10:00Z",
      "durationSeconds": 540,
      "result": "win",
      "turns": 9,
      "client": { "name": "hearthpulse-desktop", "version": "1.4.0" },
      "constructed": {
        "ranked": true,
        "playerClass": "DEATHKNIGHT",
        "opponentClass": "MAGE",
        "deckCode": "AAECAfHhBAA=",
        "deckName": "Blood DK",
        "archetype": "Blood Death Knight",
        "opponentArchetype": null,
        "wentFirst": false,
        "rankBefore": { "starLevel": 46, "stars": 2 },
        "rankAfter": { "starLevel": 46, "stars": 3 }
      }
    },
    {
      "id": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4d",
      "mode": "arena",
      "startedAt": "2026-10-22T20:00:00Z",
      "durationSeconds": 720,
      "result": "loss",
      "client": { "name": "hearthpulse-desktop", "version": "1.4.0" },
      "arena": {
        "runId": "arena-0199b2d2-0001",
        "playerClass": "PALADIN",
        "opponentClass": "ROGUE",
        "gameNumber": 5,
        "winsBefore": 3,
        "lossesBefore": 1,
        "underground": false,
        "wentFirst": true
      }
    }
  ]
}
```

### Response

200 with one result per input game, in input order:

```json
{
  "results": [
    { "id": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4b", "status": "created" },
    { "id": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4c", "status": "unchanged" },
    { "id": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4d", "status": "rejected",
      "code": "INVALID_GAME", "field": "arena.gameNumber" }
  ]
}
```

- `created`: a new game was stored.
- `updated`: the id existed and the new content replaced it (for example a
  rating learned after the game). The latest upload wins.
- `unchanged`: the same content was already stored. Replaying a batch after a
  network failure is safe; drop every `created`, `updated` and `unchanged`
  item from the outbox.
- `rejected`: the item will never be accepted as sent; drop it or fix the
  client. Codes: `INVALID_GAME` (with the first failing `field`),
  `UNSUPPORTED_MODE`, `GAME_TOO_LARGE`, `DUPLICATE_ID` (the same id twice in
  one batch: only the first is processed), `QUOTA_EXCEEDED` (the account
  already stores 50 000 games).

### Errors

Errors use `{ "error": { "code": "...", "message": "..." } }`; retry only
429 and 5xx, with exponential backoff.

- 400: `INVALID_BATCH`; Body is not `{ games: [...] }` with 1–50 items, or an
  item has no valid `id`.
- 401: `INVALID_ACCESS_TOKEN`; Missing, expired or revoked token; refresh it.
  `WWW-Authenticate: Bearer` is set.
- 403: `CLIENT_NOT_ALLOWED`; The token belongs to another client.
- 413: Body above 1 MiB. Send smaller batches.
- 429: Rate limit: 120 requests per 15 minutes per address, upload and sync
  check together.
- 503: `STORAGE_UNAVAILABLE`; Temporary storage failure.
- 503: `IDENTITY_UNAVAILABLE`; The deployment has no OIDC provider
  (`BROWSER_IDENTITY_ENABLED` is not `1`). Retry later; do not sign out.

## Sync check: `GET /api/v1/me/games`

Same authorization. Query: `limit` 1–500 (default 100), `before` (cursor
from a previous page), `since` (ISO 8601: only games that started at or
after it). Newest games first. A malformed query answers 400 `INVALID_QUERY`.

```json
{
  "total": 1287,
  "byMode": { "battlegrounds": 940, "standard": 301, "wild": 12, "arena": 34 },
  "latestStartedAt": "2026-10-22T20:00:00.000Z",
  "games": [
    {
      "id": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4d",
      "mode": "arena",
      "startedAt": "2026-10-22T20:00:00.000Z",
      "updatedAt": "2026-10-22T20:12:31.120Z"
    }
  ],
  "nextBefore": "MTc2MTE2MzIwMDAwMDowMTk5YjJkMg"
}
```

`total`, `byMode` and `latestStartedAt` describe the whole account, not the
page. A typical client uploads every local game newer than `latestStartedAt`,
then pages with `before` to reconcile older history.

## Storage

SQLite table `player_games`, owned by `server/modules/playerGames`, created
idempotently at start-up (`CREATE TABLE IF NOT EXISTS`; no separate migration
step):

- `user_id`: Account id (`users.id`), `ON DELETE CASCADE`.
- `client_game_id`: The client's `id`; primary key with `user_id`.
- `mode`: `battlegrounds`, `standard`, `wild`, `arena`.
- `started_at`, `duration_seconds`: Epoch ms and seconds.
- `result`: `win`, `loss`, `tie`.
- `hero`, `player_class`, `opponent_class`: BG hero card id; constructed/arena
  classes.
- `placement`, `duos`, `rating_before`, `rating_after`: Battlegrounds.
- `rank_before`, `rank_after`, `legend_rank_after`, `ranked`, `deck_code`,
  `archetype`: Constructed: rank as `starLevel * 4 + stars`.
- `arena_run_id`, `arena_game_number`: Arena.
- `client_name`, `client_version`, `schema_version`: Provenance.
- `detail_json`: The validated mode object (board, combats, offers…).
- `content_hash`: SHA-256 of the normalized game, decides `updated`/`unchanged`.
- `received_at`, `updated_at`: Epoch ms.

Indexes: `(user_id, mode, started_at DESC)`, `(user_id, started_at DESC)`.

## Statistics: `GET /api/account/game-stats`

Cookie session of the account page only (no bearer, no CORS); 401 without a
session, 400 for an unknown parameter value, 60 requests per minute per
address. Query: `mode` (required), `period` `all` (default), `7`, `30`,
`90` days or `season` (since the first day of the current month, the
Hearthstone ranked season); for Battlegrounds `duos` `0`/`1` and `mmr`, the
global bracket `TOP_50_PERCENT` (default), `TOP_20_PERCENT`, `TOP_5_PERCENT`
or `TOP_1_PERCENT`. The server reads at most the newest 5 000 games of the
mode and period.

Every answer has `games` (count) and, when empty, the page shows «Установите
Hearthpulse и войдите, чтобы игры появились здесь» with a link to the
desktop releases (`https://github.com/Zulut30/IceCrowV2/releases`).

- Battlegrounds: `summary` (highest rating, average placement, games, time
  played, placement counts 1–8, top-4 rate, first places), `ratingSeries`
  (per game: time, hero, placement, rating after, change, final board),
  `heroes` (games, net rating, average placement, placement counts, combat
  win rate by turn, times offered/picked when the client sent hero options).
- Standard and Wild: `summary` (games, wins, win rate, average duration and
  turns, time played, best and current rank, coin/first split), `rankSeries`,
  `decks`, `archetypes`, `opponentClasses`, `matchups` (own class × opponent
  class).
- Arena: `summary` (runs, average wins, best run, 12-win runs, game win
  rate, time played), `runs`, `classes`.

### Global comparison

The «vs Global» values use only data the site already publishes, read in
process through `server/app/playerGamesGlobalSources.ts` and cached for an
hour per query:

- Battlegrounds heroes: average placement, pick rate and placement
  distribution from the HSReplay mirror (`/api/bg/heroes`, selected `mmr`
  bracket, current patch), combat win rate by turn from the hero detail for
  the eight most played heroes. Duos has no placement distribution.
- Standard and Wild: archetype win rate from the HSGuru meta (all ranks,
  past week) matched by English or Russian name, class win rate as the
  games-weighted mean of its archetypes. There is no global class-vs-class
  constructed matchup, so the matchup grid has no comparison.
- Arena: class win rate and average wins per run from Firestone.

These datasets are paid sections of the site. The comparison is filled only
when the viewer has that section's entitlement (Wild uses Standard's);
otherwise `global.availability` is `subscription` and every global field is
`null`. A failing source gives `unavailable`. The page hides a comparison
whose value is `null` instead of inventing one.

Card and hero names come from HearthstoneJSON (`HEARTHSTONE_RU_CARDS_URL`),
loaded once a day; without them the page shows card art only.

## Development data

`npx tsx scripts/dev-seed-player-games.ts --create-user` (or `--user <id>`,
with `--reset` to replace them) writes about 550 realistic synthetic games
through the same validation as uploads, and with `--create-user` prints a
local session cookie. It writes only to `ECOSYSTEM_DB_FILE`, refuses
`NODE_ENV=production` and the production database path, and takes real
Battlegrounds hero and minion ids from HearthstoneJSON when it is reachable.
