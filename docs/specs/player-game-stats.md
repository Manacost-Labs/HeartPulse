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
idempotent by `eventId`, `202` with `accepted` and `rejected`. Authorization
and idempotency do not change. Why version 2 exists and what it costs:
[ADR 2026-10-23](../decisions/2026-10-23-tracker-events-schema-v2.md).

### Versions

- `schemaVersion: 1` stays what it was: an opaque, bounded payload. A v1
  event appears in the statistics only when its payload already carries the
  version 2 fields below; otherwise it is stored and ignored by the page.
- `schemaVersion: 2` uses the same event types and every v1 list field
  (`playerMulligan.*`, `opponentDeck.observedCards`, `finalBoard.minions`,
  `offeredCardIds`, `finalDeckCardIds`) with the same limits, and adds the
  statistics fields. `arena_draft_pick` and `collection_snapshot` are not
  checked further.
- A version 2 `battlegrounds_match`, `constructed_match`, `arena_match` or
  `arena_run` payload is at most 32 KiB (an event above it is rejected with
  `EVENT_LIMIT_EXCEEDED`) and is stored normalized: the documented fields of
  its type plus the v1 lists; any other field is dropped.
- An invalid statistics field, or a game time before 2014-01-01 or more than
  a day ahead of the server, does not reject the event. It is accepted and
  stored with its v1 lists and `statisticsError` (the first failing field),
  the statistics skip it, and the response adds
  `warnings: [{ eventId, code: "INVALID_STATISTICS", field }]` (present only
  when not empty). Fix the client; resending the same `eventId` changes
  nothing.
- An account stores at most 100 000 tracker events. A new event above the
  quota is rejected with `QUOTA_EXCEEDED`; a replay of a stored id is still
  acknowledged.
- `occurredAt` of a game is the time the game started; of `arena_run`, the
  time of the run's latest record.
- Send a game once, when it is over: the first stored copy of an `eventId`
  wins and later copies are only acknowledged.

Opponent names, BattleTags, chat and log lines are not part of any payload.
Free text (`deckName`, `archetype`, `opponentArchetype`) containing control or
bidi characters or anything shaped like a BattleTag (`#` and 3–6 digits) is an
invalid statistics field.

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

A v2 event with an invalid statistics field is still accepted and named in
`warnings`; an event above the size limit or the quota is rejected:

```json
{
  "accepted": [
    "0199b2d2-7cc7-7d75-bcea-7d28b628ef4b",
    "0199b2d2-7cc7-7d75-bcea-7d28b628ef4d"
  ],
  "rejected": [
    { "eventId": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4e",
      "code": "QUOTA_EXCEEDED" }
  ],
  "warnings": [
    { "eventId": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4d",
      "code": "INVALID_STATISTICS", "field": "gameNumber" }
  ]
}
```

## Storage

The statistics read `tracker_profile_events`
(`server/modules/trackerIngestion`) through that module's
`listEvents(userId, { types, since, limit })` and `countEvents`; there is no
second table. The ingestion module creates the index
`(user_id, event_type, occurred_at DESC)` at start-up (`CREATE INDEX IF NOT
EXISTS`, no separate migration step). Rows cascade-delete with the account.
Development databases seeded by an early build of this branch may hold an
unused `player_games` table; it can be dropped by hand.

## Switch

The account statistics are off unless `PLAYER_STATS_ENABLED=1`: then the
routes below exist and `GET /api/account/game-stats/modes` answers
`{ "modes": { "battlegrounds": 0, "standard": 0, "wild": 0, "arena": 0 } }`,
the version 2 game and run events per tab (Standard and Wild share
`constructed_match`), counted without reading payloads. The account page
shows «Моя статистика» only when a count is above zero, and a tab only for
such a mode; while off (404) or without events it shows nothing, never a call
to install the application. Version 2 events are accepted in both states.

## Statistics: `GET /api/account/game-stats`

The site's own account session (the cookie the page sends; the site's
session token as `Authorization: Bearer` works the same), never a tracker
token, no CORS; 401 without a session, 400 for an unknown parameter value,
60 requests per minute per address. Query: `mode` (required), `period` `all`
(default), `7`, `30`, `90` days or `season` (since the first day of the
current month, the Hearthstone ranked season, counted in UTC); for
Battlegrounds `duos` `0`/`1` and `mmr`, the global bracket `TOP_50_PERCENT`
(default), `TOP_20_PERCENT`, `TOP_5_PERCENT` or `TOP_1_PERCENT`. The server
reads at most the newest 5 000 events of the mode and period (Battlegrounds:
Solo and Duos together; Standard and Wild together), then filters.

Every answer has `games` (count); a mode or filter without games shows
«В этом режиме пока нет игр» or «За выбранный период игр нет». An answer is
cached per account and query for five minutes, and storing new events of the
account drops its cache.

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
- Arena: no global comparison. The only per-class Arena dataset with run
  results is Firestone's, whose data the site may not use; Arena answers carry
  `global.availability: "none"` and the page shows no note about it.

These datasets are paid sections of the site. The comparison is filled only
when the viewer has that section's entitlement (Wild uses Standard's);
otherwise `global.availability` is `subscription` and every global field is
`null`. A failing source gives `unavailable`. The page hides a comparison
whose value is `null` instead of inventing one.

Card and hero names come from HearthstoneJSON (`HEARTHSTONE_RU_CARDS_URL`),
loaded once a day; without them the page shows card art only.

On the page a comparison is called «в среднем по данным Hearthpulse»; the
page names no third-party source. Whether the site may show the Battlegrounds
and constructed datasets this way is the owner's decision (legal review
L-M4); switching `PLAYER_STATS_ENABLED` off hides every comparison.

## Own data: export and deletion

Independent of the switch, the account page lists what the tracker stored
and lets the player take it out or erase it (right of access and erasure):

- `GET /api/account/tracker-data`: `{ events, firstOccurredAt,
  lastOccurredAt }` of the account's tracker events;
- `GET /api/account/tracker-data/export`: every stored event of the account
  as one JSON file (`hearthpulse-tracker-data-YYYY-MM-DD.json`, events
  oldest first with `receivedAt`), streamed; 10 exports per hour per address;
- `DELETE /api/account/tracker-data`: deletes every tracker event of the
  account, `{ deleted }`; the statistics cache of the account is dropped.

All three need the site session (`no-store`, 401 without it); the deletion
is a cookie mutation and follows the site's CSRF rule. The block «Данные
приложения» appears on the account page only while events are stored; the
deletion asks for confirmation. Retention: events stay while the account
exists or until the player deletes them; deleting the account deletes them.
The privacy policy (`src/modules/legalPages/content.json`, section 6) says
the same.

## Development data

`npx tsx scripts/dev-seed-player-games.ts --dev-database --create-user` (or
`--user <id>`, with `--reset` to replace them) writes about 570 realistic
synthetic tracker events (`schemaVersion` 2) through the same validation and
storage as uploads, and with `--create-user` prints a local session cookie.
It writes only to `ECOSYSTEM_DB_FILE` and refuses without `--dev-database`,
with `NODE_ENV=production`, for a database whose real path is under
`/var/lib`, `/srv`, `/opt` or `/etc`, and for one with more than 50 accounts.
It takes real Battlegrounds hero and minion ids from HearthstoneJSON when it
is reachable.
