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
  which is then served. Once the ten minutes pass, the expired answer is served
  at once and renewed in the background (one read per key at a time; a failed
  renewal keeps the old answer). Until the API ships the route answers 404 or
  503 and the page does not depend on it.
- The upstream body is untrusted. Ids match `[A-Za-z0-9_]{2,80}` and dbf ids are
  safe integers (otherwise the row is dropped); percentages are finite numbers
  in 0–100 (otherwise `null`); `half` is `effect` or `trigger`; `source_url`
  starts with `https://hsreplay.net/`; texts are strings up to 400 characters;
  at most 300 bases and 200 donors per base. A donor needs exactly two
  different halves (`effect`, then `trigger`); otherwise it is dropped.
- The answer must be for the requested card (id or dbf id) and format; another
  card or format is a contract mismatch (503 or the last cached answer) and is
  never cached under the requested key.
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

- `isAssembleCard(card)`: a bold «Собирает»/«собираете»/«Assemble» in the
  Russian or English text, or the `ASSEMBLE` mechanic. The server's card seed
  has the rules text without markup, so the keyword is also found in plain
  text, but only when it stands at the start of a sentence (or after `:`, `.`,
  `>` or a space) and names what it assembles («существо», «механизм»,
  «зверя», «дракона»…; «Assemble a minion/mech/beast…»): «Собирает всё, что
  плохо лежит», «Пересобирает существо» and «Disassemble a minion» are not the
  keyword. HSJ marks none of the 13 cards with the mechanic.
- `assembleOptionsOfBase(base)`: «Лучшие сборки», every donor option by pick rate
  descending, small samples last.
- `assembleMeanWinrate(base)` / `assembleWinrateTone(value, base)`: winrate
  tone against the average of the base's real samples (the thresholds of
  `cardChoiceWinrateTone`); percent format is `formatChoicePercent`
  (re-exported from the Assemble model).
- `bestOfOffered(base, donorA, donorB)` («Мне предложили»): the best of the four
  variants of two donors by winrate among variants with a real sample; if all
  are small samples, the best of them with `lowSample: true`; a tie goes to the
  higher pick rate. `null` when a donor is not in the loaded donors of the base
  or no variant has a winrate.

## List (HeartPulse#533)

`GET /api/card-assemble/:format` (two path segments; `/:format/:cardId` is the
card route) proxies hs-data-api `/v1/hsreplay/assemble/cards?format=` for the
tool page `/standard/assemble/`. Answer, typed as `CardAssembleListData`:

```json
{
  "format": "standard",
  "checkedAt": "2026-11-19T18:18:42.596650+00:00",
  "stale": false,
  "cards": [{
    "card": { "cardId": "BE_044", "dbfId": 128892, "name": "РЕ-3-ВЕР",
      "cost": 3, "cardClass": "NEUTRAL", "rarity": "COMMON" },
    "state": "ok", "basesTotal": 38, "winRate": 48.59
  }]
}
```

- Same cache and errors as the card route: ten minutes in Express, a failed
  refresh keeps the last answer, none → 503 with `Retry-After: 30` and
  `no-store`; wrong `format` → 404 with `no-store`, no upstream request.
- Allowlist: a row needs a valid card (id `[A-Za-z0-9_]{2,80}`, safe integer dbf)
  and the requested format in `formats`; `name = name_ru ?? name`; `winRate` is
  a finite number in 0–100 else `null`; `basesTotal` an integer 0–1000 else
  `null`; `state` is `[a-z_]{1,32}` else `failed`; at most 40 rows, in the order
  of the source. A list with no surviving row is a contract mismatch (503 or the
  last answer), never `200` with `[]`.

## Card page: the «Сборка» block (HeartPulse#535)

The page of each of the 13 cards (`isAssembleCard(card)`) shows
`CardAssembleTeaser` (`src/features/CardAssembleTeaser.tsx`), not the full
section:
an emblem (the menu icon), the heading «Сборка», one line «Пул N существ ·
лучшая база — <имя> <винрейт>» and a big button «Открыть инструмент сборки».

- The button is a plain link `/standard/assemble/?card=<id>` (`&format=wild` on
  `/standard/cards/wild/…`). It is in the server HTML and works without
  JavaScript; with it the card page navigates softly (`navigatePath`).
- The figures come from the same `useCardAssemble(format, cardId, 'top', true)`
  request as before (`?base=top`), so the traffic does not grow. The best base is
  `assembleBestBase(data)`. Until the answer, and on a 404, `not_collected`,
  `no_data` or an error, the line stays empty with its place reserved
  (`min-height`): no message, no layout shift; the button stays.
- An ordinary card has neither the block nor the request.
- The block is not lazy (its link belongs to the HTML) and brings its own small
  CSS. The lazy `CardAssembleLazy` and its stylesheets are gone from the card
  routes (approval `designer-494-card-assemble.json` removed).

## Section (HeartPulse#494)

The full section lives on the tool page (`docs/specs/assemble-tool.md`):
`CardAssembleSection` is open to everyone, like «Что берут из Открытия».

- Header: pool size, mean winrate after assembling, the best base by
  winrate among real samples, and the period.
- «Что выпало?»: round portraits of the bases, most offered first. The first 24
  are shown, «Показать всех» opens the rest, a search field appears above 20.
  A tap loads that base's donors (`base=<dbf>`); the ribbon stays on screen.
- «Лучшие сборки»: one plate per donor option, ten at first and «Показать
  все». The base's half is ink, the donor's half a gold marker, a stitched
  seam between them; screen readers get «От донора»/«От базы» prefixes.
- «Мне предложили»: two slots and the donors of the base that have HSReplay
  winrate data. Two chosen give their four builds, the best (`bestOfOffered`)
  first, glowing and marked «Лучший выбор».
- `missing` (404) renders nothing; `no_data` or no bases says «Мало данных»;
  an error keeps a retry button.

## Offered: the full donor pool (HeartPulse#515)

`data.donor_pool_status` and `bases[].donor_pool[]` (hs-data-api#160) pass
the projection allowlist: `{ state, classDependent, playerClass }` and per
donor `{ card, hasStats, options }` with exactly two halves (`effect`,
`trigger`) and their texts. The proxy and its cache are unchanged (no new
parameters). A pool is only kept when the status is `ok`; a broken,
missing or empty pool is `null` and the section behaves as before.

- «Мне предложили» offers every donor of the pool, donors with statistics
  first, then those that never met the base (`hasStats: false`), marked «не
  встречался в играх». Search and the «Показать всех» grid are the same.
- Donors without statistics can be chosen; their two texts show «Нет данных»
  and no percentages or bars. «Лучший выбор» only compares variants with
  statistics. If neither donor has statistics, the section says so in words
  and in the `aria-live` region, and shows the four texts.
- The pool of the neutral F3TCH3R depends on the player's class
  (`classDependent`). «За какой класс играете?» (11 class crests) filters
  the base ribbon (the class's bases and neutral ones) and the donors
  (the class and neutral ones); without a class «Мне предложили» asks for
  one. The filter is client side. Class cards (BE_702) and Raj (BE_004) show
  the pool as the API sent it.
- `mismatch`, `unavailable` or no pool: only donors with winrate data, as
  in HeartPulse#494, and no class choice.
