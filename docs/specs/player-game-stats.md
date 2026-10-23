# Player game statistics

## Objective

A signed-in player sees personal statistics on the account page `/profile/`
in the spirit of HSReplay «My Stats», in four tabs: Battlegrounds, Standard,
Wild and Arena. The games come from the desktop tracker through the existing
[tracker ingestion](tracker-ingestion.md); the site never parses logs and
adds no second upload path. Local tracking in the desktop application stays
authoritative; this page only reads what the tracker uploaded.

Owners: `server/modules/trackerIngestion` (upload, storage),
`server/modules/playerGames` (statistics payload check, aggregation),
`src/modules/playerStats` with its Valyro composition in
`src/features/playerStats` (the account tabs).

## Upload

The tracker keeps using `POST /api/v1/tracker/events/batch` with the OAuth
device-flow token of client `manacost-tracker` and scope `tracker.write`
([tracker ingestion](tracker-ingestion.md)): batches of 1–50 events,
idempotent by `eventId`, `202` with `accepted` and `rejected`. Nothing about
authorization, limits or idempotency changes.

### Versions

- `schemaVersion: 1` stays what it was: an opaque, bounded payload. A v1
  event appears in the statistics only when its payload already carries the
  version 2 fields below; otherwise it is stored and ignored by the page.
- `schemaVersion: 2` uses the same event types and every v1 list field
  (`playerMulligan.*`, `opponentDeck.observedCards`, `finalBoard.minions`,
  `offeredCardIds`, `finalDeckCardIds`) with the same limits, and adds the
  statistics fields. For `battlegrounds_match`, `constructed_match`,
  `arena_match` and `arena_run` the server checks them strictly; an invalid
  event is rejected with `INVALID_EVENT` and `field`, the first failing field.
  `arena_draft_pick` and `collection_snapshot` are not checked further. The
  payload is stored exactly as sent.
- `occurredAt` of a game is the time the game started; of `arena_run`, the
  time of the run's latest record.
- Send a game once, when it is over: the first stored copy of an `eventId`
  wins and later copies are only acknowledged.

Opponent names, BattleTags, chat and log lines are not part of any payload.

### Common game fields (v2)

- `durationSeconds`: integer, 0–14 400. Required.
- `turns`: integer, 0–200, optional. Constructed and Arena: the player's own
  turns; Battlegrounds: tavern turns.
- `result`: `win`, `loss` or `tie`. Required for `constructed_match` and
  `arena_match`; Battlegrounds derives it from the placement (top 4, Duos
  top 2). A tie counts as «not a win» in every win rate on the page.

### `battlegrounds_match` (v2)

- `heroCardId`: card id of the hero played. Required.
- `placement`: 1–8; Duos 1–4. Required.
- `duos`: boolean, default `false`.
- `ratingBefore`, `ratingAfter`: 0–30 000 or null.
- `anomalyCardId`: card id or null.
- `races`: at most 6 of `BEAST`, `DEMON`, `DRAGON`, `ELEMENTAL`, `MECHANICAL`,
  `MURLOC`, `NAGA`, `PIRATE`, `QUILBOAR`, `UNDEAD`.
- `tavernTier`: 1–7.
- `finalBoard.minions`: at most 7 `{ cardId, attack, health, golden }`;
  attack and health 0–100 000.
- `combats`: at most 60 `{ turn, result, damageDealt, damageTaken,
  opponentHeroCardId }`; turn 1–60, result `win`/`loss`/`tie`, damage 0–200.
- `heroOptions`: at most 4 hero card ids offered at the start, including the
  one picked. Pick rate counts only games whose options include the hero.
- `offers`: at most 80 `{ turn, kind, offered, picked }`; kind `hero`,
  `discover`, `trinket`, `quest`, `reward`, `buddy` or `other`; `offered` at
  most 8 card ids; `picked` a card id or null.

Card ids match `[A-Za-z0-9_]{2,64}`.

### `constructed_match` (v2)

- `format`: `standard` or `wild`. Required.
- `ranked`: boolean, default `true`; casual games count in the totals only.
- `playerClass`, `opponentClass`: `DEATHKNIGHT`, `DEMONHUNTER`, `DRUID`,
  `HUNTER`, `MAGE`, `PALADIN`, `PRIEST`, `ROGUE`, `SHAMAN`, `WARLOCK`,
  `WARRIOR`. Required.
- `heroCardId`, `opponentHeroCardId`: optional card ids.
- `deckCode`: optional deck string, 4–256 base64 characters.
- `deckName`, `archetype`, `opponentArchetype`: optional text, at most 80
  characters, no control characters.
- `wentFirst`: boolean or null; `false` means the player had the coin.
- `rankBefore`, `rankAfter`: `{ starLevel, stars, legendRank }` or null;
  `starLevel` 1–51 as the client counts it (Bronze 10 = 1 … Diamond 1 = 50,
  Legend = 51), `stars` 0–3, `legendRank` 1–1 000 000 only with level 51.
- v1 fields `playerMulligan` and `opponentDeck` stay as they were.

### `arena_match` (v2)

- `runId`: the run's id, 8–64 of `A-Z a-z 0-9 . _ : -`. Required.
- `playerClass`, `opponentClass`: class names as above. Required.
- `gameNumber`: 1–20, the game's place in the run. Required.
- `winsBefore` (0–12), `lossesBefore` (0–3): optional record before the game.
- `underground`: boolean, default `false`; `wentFirst`; `deckCode`.

### `arena_run` (v2)

- `runId`, `playerClass`, `wins` (0–12), `losses` (0–3). Required.
- `complete`: boolean or null (null: complete at 12 wins or 3 losses).
- `underground`: boolean. v1 `finalDeckCardIds` stays as it was.

The newest `arena_run` record of a run is its score on the page, even when
not every game of the run was uploaded.

### Example

```json
{
  "events": [
    {
      "eventId": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4b",
      "type": "battlegrounds_match",
      "schemaVersion": 2,
      "occurredAt": "2026-10-22T15:04:11Z",
      "payload": {
        "durationSeconds": 1260,
        "turns": 13,
        "heroCardId": "BG20_HERO_242",
        "placement": 2,
        "duos": false,
        "ratingBefore": 6412,
        "ratingAfter": 6451,
        "races": ["BEAST", "DEMON", "MECHANICAL", "NAGA", "UNDEAD"],
        "tavernTier": 6,
        "finalBoard": {
          "minions": [
            { "cardId": "BG25_008", "attack": 48, "health": 51, "golden": true }
          ]
        },
        "combats": [
          { "turn": 1, "result": "tie", "damageDealt": 0, "damageTaken": 0 },
          { "turn": 2, "result": "win", "damageDealt": 3, "damageTaken": 0 }
        ],
        "heroOptions": ["BG20_HERO_242", "BG22_HERO_000"]
      }
    },
    {
      "eventId": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4c",
      "type": "constructed_match",
      "schemaVersion": 2,
      "occurredAt": "2026-10-22T19:10:00Z",
      "payload": {
        "format": "standard",
        "ranked": true,
        "result": "win",
        "durationSeconds": 540,
        "turns": 9,
        "playerClass": "DEATHKNIGHT",
        "opponentClass": "MAGE",
        "deckCode": "AAECAfHhBAA=",
        "deckName": "Blood DK",
        "archetype": "Blood Death Knight",
        "wentFirst": false,
        "rankBefore": { "starLevel": 46, "stars": 2 },
        "rankAfter": { "starLevel": 46, "stars": 3 },
        "playerMulligan": { "initial": ["CARD_1"], "kept": ["CARD_1"] }
      }
    },
    {
      "eventId": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4d",
      "type": "arena_match",
      "schemaVersion": 2,
      "occurredAt": "2026-10-22T20:00:00Z",
      "payload": {
        "result": "loss",
        "durationSeconds": 720,
        "runId": "arena-0199b2d2-0001",
        "playerClass": "PALADIN",
        "opponentClass": "ROGUE",
        "gameNumber": 5,
        "winsBefore": 3,
        "lossesBefore": 1
      }
    },
    {
      "eventId": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4e",
      "type": "arena_run",
      "schemaVersion": 2,
      "occurredAt": "2026-10-22T21:30:00Z",
      "payload": {
        "runId": "arena-0199b2d2-0001",
        "playerClass": "PALADIN",
        "wins": 6,
        "losses": 3,
        "complete": true
      }
    }
  ]
}
```

A rejected v2 event names its first invalid field:

```json
{
  "accepted": ["0199b2d2-7cc7-7d75-bcea-7d28b628ef4b"],
  "rejected": [
    { "eventId": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4d",
      "code": "INVALID_EVENT", "field": "gameNumber" }
  ]
}
```

## Storage

The statistics read `tracker_profile_events`
(`server/modules/trackerIngestion`) through that module's
`listEvents(userId, { types, since, limit })`; there is no second table and
no migration. Rows cascade-delete with the account.

## Statistics: `GET /api/account/game-stats`

The site's own account session (the cookie the page sends; the site's
session token as `Authorization: Bearer` works the same), never a tracker
token, no CORS; 401 without a session, 400 for an unknown parameter value,
60 requests per minute per address. Query: `mode` (required), `period` `all`
(default), `7`, `30`, `90` days or `season` (since the first day of the
current month, the
Hearthstone ranked season); for Battlegrounds `duos` `0`/`1` and `mmr`, the
global bracket `TOP_50_PERCENT` (default), `TOP_20_PERCENT`, `TOP_5_PERCENT`
or `TOP_1_PERCENT`. The server reads at most the newest 5 000 events of the
mode and period (Battlegrounds: Solo and Duos together, then filters).

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
with `--reset` to replace them) writes about 570 realistic synthetic tracker
events (`schemaVersion` 2) through the same validation and storage as
uploads, and with `--create-user` prints a
local session cookie. It writes only to `ECOSYSTEM_DB_FILE`, refuses
`NODE_ENV=production` and the production database path, and takes real
Battlegrounds hero and minion ids from HearthstoneJSON when it is reachable.
