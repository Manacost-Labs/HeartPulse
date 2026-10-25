# Card page: what players pick from Discover

A card with a choice mechanic gets the section «Что берут из Раскопки» on its
page (`/standard/cards/<format>/<cardId>/`). Russian client keywords are used:
Discover — «Раскопка», Adapt — «Адаптация», Dredge — «Улов», Choose One —
«Выберите эффект», Excavate — «Добыча».

## Data

`GET /api/card-choices/:format/:cardId?rank=legend|bronze_gold` (public, cached
for 5 minutes in browsers and 10 minutes in Express) projects hs-data-api
`/v1/hsreplay/card-choices` (source `hsreplay_card_choices`, see
`docs/HSREPLAY_CARD_CHOICES.md` in hs-data-api). Unknown cards and cards
without a choice answer 404; an unavailable upstream answers 503 unless a
previous answer is cached, which is then served. The upstream body is
untrusted: only ids matching `[A-Za-z0-9_]`, known kinds, formats and ranks
and `https://hsreplay.net/` links pass.

- `options[]`: HSReplay rows. «Берут» (`popularity`) is how often the option
  is taken when it is offered, so the column sums to more than 100%;
  «Винрейт» is the winrate after taking it. `lowSample` (exact 0/100) shows
  «Мало данных»; `undervalued` (winrate a point above the options' average,
  taken less often than the median) shows «Недооценённый выбор».
- `pool`: the full pool from the card base under «Все варианты»; options
  HSReplay does not list are marked «мало данных». `resolved: false` means the
  pool depends on the game (your deck, the opponent's hand).
- `pool.tiers`: Excavate treasures by tier, without pick statistics.

## Presentation

`src/modules/constructedCards/ui/CardChoicesSection.tsx`, mounted by
`StandardCardDetail` only when the card's mechanics contain DISCOVER, ADAPT,
DREDGE, CHOOSE_ONE or EXCAVATE (other cards send no request). Option tiles
show the card render, «Берут» with a 0–100% bar and «Винрейт» coloured
green/red against the options' own average. A Legend / Bronze–Gold switch,
the source line with the HSReplay link and data date, a skeleton while
loading and an empty state («Мало данных…») are part of the section. Phones
show one compact row per option. Choose One shows the card's two options;
HSReplay does not track that choice.
