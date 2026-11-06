# Year in review («Итоги года Hearthpulse»)

## Objective

A shareable page of a player's year from the games the Hearthpulse app sent
to the profile (tracker events, [player game stats](player-game-stats.md)):
games, hours, favourite class and deck, best streak, top cards, Battlegrounds
favourite hero and top-4 rate, and a share image.

## Visibility

- Only a public profile that shows its statistics (`public_stats_visible`,
  switched on by the owner; off by default) has a review. Hidden, blocked and
  missing profiles answer 404 alike (`findPublicStatsOwner`).
- A year opens on December 1 of that year (UTC). `YEAR_REVIEW_ENABLED=1` in
  the Express environment opens it earlier (testing), `0` keeps it closed; a
  future year never opens. Closed → 404.
- No name: the page and the image say «Итоги года Hearthpulse <year>», never
  the profile's display name, BattleTag or account id.

## API

`GET /api/profiles/:publicProfileId/year/:year` (`server/modules/playerGames`,
`routes/yearReviewRoutes.ts`), 60 requests a minute per address.

- Reads every game of the year that started before the start of the current
  UTC day (the public statistics' rule), at most 20 000.
- 200, `Cache-Control: public, max-age=300`:
  `{ year, games, hours, modes: { battlegrounds, standard, wild, arena }, wins,
  winRate, bestStreak, bestMonth, favouriteClass, favouriteDeck, topCards,
  battlegrounds: { games, favouriteHero, top4Rate, averagePlacement,
  bestRating } }`.
- `winRate` counts Constructed and Arena games (ties excluded);
  `bestStreak` is the longest run of wins over all games in order, a
  Battlegrounds top-half finish counting as a win; `topCards` are the five
  cards in the most games of the decks played (deck codes decoded, dbf ids
  mapped to card ids and Russian names from HearthstoneJSON).
- Answers are cached per account, year and day for ten minutes; a new upload
  drops the account's entries.

## Pages

- `/id/<publicProfileId>/year/<year>/` (Next, `noindex`): tiles, «Карты
  года», a link to the favourite deck's embed, the «Сделано в Hearthpulse»
  band.
- `/og/year/<publicProfileId>/<year>/`: 1200 × 630 PNG with the numbers and
  the favourite Battlegrounds hero's card art; one image per profile, year
  and day in the Next process.
