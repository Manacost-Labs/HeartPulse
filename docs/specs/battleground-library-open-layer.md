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

## Card pages (`/library/<kind>/<slug>-<id>/`, `/library/archive/<kind>/<slug>-<id>/`)

`GET /api/bg/library/public/:kind/:dbfId` (and the `archive` and `extra`
variants) answers `{ card, canonicalPath, stats, related }`. `card` is the
anonymous projection (identity, type, tier, tribe, attack, health, text,
mechanics, the golden version's attack and health, images). `stats` is the
open base slice of the minion from the projection above (only for a minion in
the current pool; `null` below the sample, for archive cards and for spells)
with the completion time of the run. `related` is up to six cards chosen by
tags the catalog states: for a minion those of the same tribe (the nearest
tavern tiers first), for a spell those of the same tavern tier, in the same
pool state, never the card itself; no hand-written text. A card page never
waits for, or starts, the bulk read of every pool (the single-card identity
exists to avoid it): related cards come from the catalog the router already
holds, and a cold start warms it behind the answer. A failing statistics source
with no copy is a `503` with `Retry-After`: never a `200` without the figures
the indexing rule counts.

`proxy.ts` reads the answer once and hands the page the card and `stats` in the
request header `x-hearthpulse-bg-public-projection` (a card that does not fit
the 4 KB header is a `503`, as before), and the related cards in a header of
their own (`x-hearthpulse-bg-public-related`, the longest prefix that fits). The
page re-parses field by field (`lib/publicBattlegroundLibraryCardData.ts`).

The page (`lib/battlegroundLibraryDetailRoute.tsx`) is dynamic, one document
for everyone: the H1, one line of facts under it (type, tribe, tier,
attack/health, average place, mechanics: a template, no hand-written text), then
`BattlegroundLibraryPublicCard`: characteristics (type, tier, tribe,
attack/health, the golden version), the card text, mechanics, the base
statistics with date and source, related cards. The closed part (strength by
round, purchases, board positions, history) is one locked button in
`.paywalled-library-card`; a subscriber has `BgLibrary` in place of the open
layer once its chunk is loaded. JSON-LD: the entity graph and, when the card has
statistics, a `Dataset` with `isAccessibleForFree: false` and
`hasPart.cssSelector: ".paywalled-library-card"`.

The task brief asked for two or three sentences of explanation; the owner's rule
of 2026-11-19 (open data is the main content, one line under the H1, no
explanatory blocks after the data) wins: the explanation is the one line under
the H1.

## Indexing of card pages

`isIndexableBattlegroundLibraryCard` (`shared/battlegroundLibraryIndexing.ts`)
counts the card's own facts and applies the site threshold
(`meetsContentThreshold`: 150 own words or 10 own facts; the page's words are
not counted, only facts). Facts: the name, the type, the tavern tier, the tribe,
attack, health, the text, each mechanic, the golden version's attack and
health, and the four figures of the base statistics. The card page's meta
robots and the minion segment of the sitemap
(`loadBattlegroundLibrarySitemapRows`) call the same function on the same
projection and the same statistics, so a page is `index` exactly when it is
listed. A page below the threshold is `noindex, follow`, has no entity JSON-LD
and is not in the sitemap. With today's data (2026-11-19): a minion of the pool
with statistics has 12–16 facts, 776 of the 999 archived minions cross the line
(10–15 facts), every spell has 4–6 (none does). No page state depends on
whether the statistics source answered: a source failure with no copy is a
`503`, not a quiet change from `index` to `noindex`.

Spells: no spell page reaches ten facts, so the `battleground-spells` segment
of the sitemap is not registered (an empty segment is invalid); it returns with
the first spell page that crosses the threshold. The production monitor, the
static sitemap index model and their tests no longer list it.
The `lastmod` day of a minion follows the projection as it was before the open
layer (`sitemapCardIdentity`), so introducing the golden version and the
thumbnail does not date every card anew.

Tests: `tests/battleground-library-open.check.ts` (the card route, related
cards, one rule for the page and the sitemap, the parsers' allowlist and the
sentinel check on a dirty answer), `tests/entity-sitemap-sources.test.ts`
(the sitemap filter), `tests/next-library-open.check.mjs` and
`tests/next-bg-library-details-browser.test.mjs` (the built card pages).

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
