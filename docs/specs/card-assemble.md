# Card page: «Сборка» (Assemble)

13 cards of Reign of the Black Empire (`BE_004 BE_044 BE_045 BE_087 BE_114
BE_229 BE_257 BE_262 BE_553 BE_571 BE_702 BE_740 BE_851`) have the keyword
«Собирает»: the game offers two donor minions for a random base minion, and the
player takes one half of a donor (its trigger or its effect) while the other
half comes from the base. This spec covers the data layer; the UI section is
HeartPulse#494.

## Data

`GET /api/card-assemble/:format/:cardId?base=<dbf|top>` (public, cached for 5
minutes in browsers and 10 minutes in Express; `format` is `standard` or `wild`,
`base` defaults to `top`) projects hs-data-api `/v1/hsreplay/assemble` (source
`hsreplay_assemble`; contract in api.kolodahearthstone.com#136). `base=top`
loads the donors of the most offered base only, `base=<dbf>` the donors of that
base; the other bases carry `donors: null` and `donorsTotal`.

- Wrong `format`, `cardId` or `base` answer 404 with `no-store`, without an
  upstream request. An upstream 404 (not an Assemble card, unknown base) is 404.
- An upstream error, timeout or a body that is not the contract answers 503
  with `Retry-After: 30` and `no-store`, unless a previous answer is cached,
  which is then served. Until the API ships the route answers 404 or 503 and
  the page does not depend on it.
- The upstream body is untrusted. Ids match `[A-Za-z0-9_]{2,80}` and dbf ids are
  safe integers (otherwise the row is dropped); percentages are finite numbers
  in 0–100 (otherwise `null`); `half` is `effect` or `trigger`; `source_url`
  starts with `https://hsreplay.net/`; texts are strings up to 400 characters;
  at most 300 bases, 200 donors per base and two options (`effect`, `trigger`)
  per donor.
- Only what the Russian site renders goes out: `name_ru ?? name`, and the text
  `{ trigger, effect, locale }` from `text.ru ?? text.en` (`locale` says which;
  `null` when neither exists). English names, `unresolved_rows` and `game_type`
  are not exposed.
- `options[].half` is the half of the donor; the full text is
  `trigger + ' ' + effect`. `pickRate` is how often the half is taken when the
  donor is offered, `winRate` the winrate with that build, `lowSample` is under
  10 picks, `undervalued` is a hint from the API (winrate above the base's
  average, picked less often than the median).

## Client model

`src/modules/constructedCards/model/cardAssemble.ts` (pure functions) and
`useCardAssemble(format, cardId, base, enabled)` (states `idle | loading |
missing | ready | error`; ordinary cards send no request).

- `isAssembleCard(card)`: a bold «Собирает»/«Assemble» in the Russian or English
  text, or the `ASSEMBLE` mechanic. HSJ marks none of the 13 cards with it.
- `assembleOptionsOfBase(base)`: «Лучшие сборки», every donor option by pick rate
  descending, small samples last.
- `assembleMeanWinrate(base)` / `assembleWinrateTone(value, base)`: winrate
  tone against the average of the base's real samples (the thresholds of
  `cardChoiceWinrateTone`); percent format is `formatChoicePercent`.
- `bestOfOffered(base, donorA, donorB)` («Мне предложили»): the best of the four
  variants of two donors by winrate among variants with a real sample; if all
  are small samples, the best of them with `lowSample: true`; a tie goes to the
  higher pick rate. `null` when a donor is not in the loaded donors of the base
  or no variant has a winrate.
