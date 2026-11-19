# Battlegrounds library: the open layer (E21)

What a guest and a robot read of the Battlegrounds library without a
subscription, and what stays closed. Owner decision of 2026-11-18: the base
slice of the library statistics is open (average place and popularity of a
minion, rating range «Топ 50%», current patch); the narrow rating ranges, the
per-round strength, purchases, board positions and history stay closed.
Access to the interactive `BgLibrary` view is unchanged
(`docs/specs/battleground-library.md`).

## Open statistics of the base slice

`server/battlegroundLibraryOpenStats.ts` is the one projection of the library
statistics for every reader: the listing route, the card route and the sitemap
source. It reads `GET /api/bg/library/minion-stats` of the Battlegrounds
service (the base range is the service's default; an answer whose
`latest_run.mmr_percentile` is not `TOP_50_PERCENT` is rejected) and copies by
name (an allowlist): `avgPlacementWith`, `avgPlacementWithout`, `popularity`,
`gamesWith`, and the completion time of the run. A minion below the sample
threshold of the source (30 games) has no figures, never a zero. Closed and
never copied: `impact`, `combat_winrate`, the rounds, purchases, board
positions, `games_without_minion` and the history. The store
(`createLibraryStatsStore`) keeps a five-minute live window, one deduplicated
refresh and the last known good copy; it rejects only on a cold start with the
source down, and the route then answers `503` with `Retry-After`.

Spells have no open statistics: their source (Firestone) has no sample
threshold and its rows hold single games.

## Listings (`/library/`, `/library/<kind>/`)

Express answers `GET /api/bg/library/public/listing/:kind` (`minions`,
`spells`, `anomalies`, `dark-gifts`, `quests`, `rewards`, `darkmoon-prizes`,
`trinkets`, `timewarped`; the current pool only) and
`GET /api/bg/library/public/listing` (the size of each listing) from
`server/battlegroundLibraryListing.ts`. The path carries the segment `public`,
so the scraping guard (#485) picks it up. Every listing has a store of its own
(five minutes, own `ETag`, `Cache-Control: public, max-age=300,
stale-while-revalidate=600`) that is also the last known copy: a failing source
answers it with `warning: "stale"` and `max-age=60`; no copy is a `503` with
`Retry-After` and `no-store` (never `502`, never an empty list). A row holds
`dbfId`, `name`, the canonical `path`, `tavernTier`, `typeName`, `group` (tribe
of a minion, group of a trinket), `attack`, `health` and, for a minion, `stats`
(average place, popularity, sample). No picture: three hundred thumbnails
double the weight of the page. Staged kinds are read from the card service page
by page (100 per page, six pages at most).

The Next pages (`app/library/page.tsx`, `app/library/[kind]/page.tsx`) are ISR
(`revalidate = 300`, metadata without request data). The loader
(`lib/publicBattlegroundLibraryListing.ts`) re-parses field by field
(`publicBattlegroundLibraryListingData.ts`) and, when the source fails, serves
the last listing this process verified, so a regeneration never replaces the
cards with an empty page. A listing the process never read, with the source
down, is a 200 page with a notice («Список карт временно недоступен») and the
closed part, as the open hero ranking is; the next regeneration retries.
`BattlegroundLibraryPublicListing` prints the cards grouped by tavern tier
(a table per tier, anchors `#tier-N`) with name, link, tribe, attack/health and,
for minions, average place and popularity, with the date and source of the
statistics. The hub prints a link to every listing with its size (the links
stay when the sizes are unavailable). The archive listings have no open list
and keep the gate.

The page carries every element twice (in the HTML and in the RSC payload), so a
tier's table is built by a client component from one text line per card
(`LibraryListingTable`): the markup is a string without the optional end tags
(valid HTML), every value is escaped, and the payload holds the lines, not
elements. The minion listing (303 cards) weighs about 215 KB raw, the budget is
250 KB (the same technique as the open Arena tier list).

The same HTML goes to every visitor and robot. A visitor without access sees
the list and, wrapped in `.paywalled-library`, one locked button («Фильтры,
сравнение карт и статистика по ходам»); a press opens the subscription offer. A
subscriber has the interactive view in place of the list, and only after its
chunk is loaded (`useBgLibraryModuleLoaded`), so the swap is one render and adds
no layout shift. JSON-LD: the registered `CollectionPage` with an `ItemList` of
the table (the first 100, the limit of `seoStructuredDataGraph`),
`isAccessibleForFree: false` and `hasPart.cssSelector: ".paywalled-library"`,
and for minions a `Dataset` of the open slice with the same `hasPart`.

Data markers for the post-deploy warm-up (slice #476): pages
`/library/`, `/library/minions/`, `/library/spells/`, `/library/anomalies/`,
`/library/dark-gifts/`, `/library/quests/`, `/library/rewards/`,
`/library/darkmoon-prizes/`, `/library/trinkets/`,
`/library/timewarped/`; the CSS marker of the block with data is
`.bg-library-public`.

## Tests

- `tests/battleground-library-open.check.ts` (imported by
  `tests/battleground-library-seo-routes.test.ts`): projection, routes, `ETag`,
  last good copy, `503`, the parsers, and the sentinel check: every closed
  figure of the source has a mark of its own
  (`tests/helpers/battlegroundLibraryOpenFixture.ts`) and the tests fail when
  one reaches a projection, an answer or a parser result. A mutation that
  copies `impact` into the projection turns them red.
- `tests/next-library-open.check.mjs` (imported by
  `tests/next-bg-library-listings-browser.test.mjs`): the built pages against a
  real Express: rows, `ItemList`, no closed value in the HTML, the RSC payload or
  the JSON-LD, the same HTML for a guest and a robot, the last listing kept when
  the source fails.
