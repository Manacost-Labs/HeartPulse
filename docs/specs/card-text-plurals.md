# Card text plurals

Hearthstone writes counted nouns as `2 |4(ход,хода,ходов)`: the game picks the
form for the number before the marker (Russian one/few/many, English
one/other). The card catalog serves such texts two ways, and both reached
pages unrendered:

- the markup intact (`получаете 2 |4(копию,копии,копий)`), mostly
  Battlegrounds cards;
- the number and marker stripped, leaving a bare `(ход,хода,ходов)`, mostly
  Standard and Wild cards.

`shared/hearthstoneCardText.ts` renders the markup with the nearest number
before it. A game placeholder (`{0}`, `@`) takes the many form. Bare groups
are restored from the original HearthstoneJSON `ruRU` text of the same card.
`server/cardPluralTexts.ts` keeps only the original texts that count
something (a few hundred) in memory, refreshes them twice a day, and never
fails a request: a missing or late download leaves the bare group as it was.

The server renders card texts where catalog payloads enter it, so pages,
search, tooltips and SEO HTML share one result:

- `fetchConstructedCardJson` (Standard and Wild catalog and details), which
  waits up to 3 seconds for the original texts;
- the Battlegrounds app, legacy and extra-library proxies, whose Redis keys
  carry a `-v2` suffix so day-old unrendered bodies are not served;
- the cosmetics catalog fetch and the Battlegrounds SEO projections.

A few cards count with a game placeholder that the catalog also strips (for
example FIR_911 or ETC_210); their counts cannot be recovered and stay as the
catalog sends them.
