# Battleground heroes access

`/heroes/` publishes its title, description, canonical URL and, since E21 OL2a
(#305), the open hero ranking to every visitor. The interactive tier list and
the narrower rating ranges continue to use the existing `/api/bg/heroes`
client and require the `battlegrounds` entitlement. An administrator may use
the same statistics without a separate subscription, matching the Express
access policy.

## Open ranking (`/heroes/`)

Express answers `GET /api/bg/heroes/public?mode=solo|duos` (default `solo`)
from `server/battlegroundHeroRankingRoutes.ts`. The rating range is fixed by
the server (`TOP_50_PERCENT`, `server/battlegroundHeroRankingSource.ts`); any
`mmr` parameter or other mode is a 400, so a caller cannot ask for a closed
range. The projection (`server/battlegroundHeroRankingProjection.ts`) copies
fields by name (an allowlist):

- hero: `dbfId`, `cardId`, `name`, `image` (same-origin public-resource path),
  `tier`;
- figures: `avgPlacement`, `top4Rate` (sum of the first four places of the
  eight-place distribution, percent to 0.1; `null` in duos, which has four
  places), `pickRate`, `games` only if the source row has a sample size;
- short tip: `heroPowerName`, `bestComposition`, up to three `keyMinions`
  names;
- `updatedAt` (`fetched_at`), `source`, `mode`, `mmr`.

A hero the source has not rated (no tier or average place) is not in the
ranking. Rows are ordered by average place. The route has its own store per
mode (five minutes, own ETag) that is also the last known copy: a failing
source answers it with `warning: "stale"`; no copy at all is a 503 with
`Retry-After`, never an empty list. Closed and never copied: other rating
ranges, the full placement distribution, `adjusted_avg_placement`,
`anomaly_adjusted`, history between patches. `/api/bg/heroes` (every range),
`/api/bg/heroes/compositions` and `/api/bg/heroes/:dbfId/details` stay behind
the access guard.

The Next page (`apps/public-web/app/heroes/page.tsx`, ISR 5 minutes) reads
both modes anonymously (`lib/publicBattlegroundHeroes.ts`, which re-parses
field by field in `publicBattlegroundHeroesData.ts`) and renders
`BattlegroundHeroesPublicRanking`: a table per mode (Solo and Duos both in the
HTML, anchors `#heroes-solo` and `#heroes-duos`, no script needed). The same
HTML goes to every visitor and robot. A visitor without access (a guest or a
signed-in non-subscriber) sees the table and, in the closed part wrapped in
`.paywalled-heroes`, locked buttons «Топ 20% / 5% / 1%» that carry no data; a
press opens the subscription offer. A subscriber has the interactive view in
place of the table (it is unmounted, not hidden: no duplicate). JSON-LD:
`CollectionPage` with an `ItemList` of the solo table (same names and URLs)
and a `Dataset` with `isAccessibleForFree: false` and
`hasPart.cssSelector: ".paywalled-heroes"`.

Tests: `tests/battleground-hero-ranking-public.test.ts` (projection, route,
guard, JSON-LD) and `tests/next-heroes-ranking.test.mjs` (built page: HTML,
RSC payload, JSON-LD); the fixture `tests/helpers/battlegroundHeroesFixture.ts`
gives every closed figure a unique value and the tests fail if one is found.

## Detail route and open statistics (`/heroes/<id>/`)

The Next.js list route is staged while public Nginx traffic remains on the
legacy page. The `/heroes/:dbfId/` detail route is also staged in Next.js.
Express exposes `/api/bg/heroes/public/:dbfId` as a cacheable anonymous
projection of hero ID, name, image, hero power and, since E21 OL2b (#384), the
block `stats`: the hero's row in the open ranking of the base range
(`TOP_50_PERCENT`), solo and duos
(`server/battlegroundHeroStatsProjection.ts`, copied by name). Per mode:
`tier`, `avgPlacement`, `top4Rate` (`null` in duos), `pickRate`, `games` (only
if the source row has one), `bestComposition`, up to three `keyMinions`, `rank`
and `of` (place among the rated heroes of the mode, best average place first);
plus `updatedAt` (the older mode date), `source`, `mmr`, `warning: "stale"`.
The block is read through a store of the route itself
(`server/battlegroundHeroRankingStore.ts`: five minutes, deduplicated refresh,
last known copy); a source that fails with no copy leaves the answer without
figures (`stats: null`, the hero is still served), so a failing ranking never
takes the page or the subscriber's view down. An unrated hero has `stats: null`.
Closed and never copied: other rating ranges, the placement distribution,
`adjusted_avg_placement`, compositions with metrics, patch history (they stay on
`/api/bg/heroes/:dbfId/details` behind the access guard). Missing IDs return
404 and upstream failures of the hero catalog return retryable 503. Next.js
does not forward account cookies to this endpoint and returns a real 404 for
missing IDs.

`apps/public-web/proxy.ts` reads the answer once and carries the hero and its
parsed statistics to the page in the projection header (the statistics are
dropped from the header when it would not fit; the page then reads them itself).
`lib/publicBattlegroundHeroStats.ts` re-parses field by field, so a figure that
should not be there cannot reach the HTML, the RSC payload or the JSON-LD.

The page (`apps/public-web/app/heroes/[dbfId]/page.tsx`, dynamic) renders the
open data as the main content: under the H1 one line built from the facts
(tier, average place, top-4, best build), then `BattlegroundHeroPublicStats`
(`.bg-hero-public`): the hero power, one block per mode with tier, average place,
top-4, pick rate, sample, place in the ranking, best build and key minions, then
the date and source. Everyone without access sees it; a visitor without access
also gets, in the closed part `.paywalled-hero`, one lock button that carries no
data (a press opens the subscription offer). A subscriber's paid view replaces
the open block in one render after its chunk has loaded (no layout shift). The
robot and the guest get the same HTML.

Indexing: `isIndexableBattlegroundHero` (`shared/battlegroundHeroIndexing.ts`,
on the threshold of `shared/seoIndexThreshold.ts`, see
`docs/specs/seo-entity-indexing.md`) counts the hero's name plus every open
figure the page prints; fewer than ten facts (a hero rated in one mode only)
makes the page `noindex, follow` without JSON-LD, and the hero segment of the
sitemap (`loadBattlegroundHeroSitemapRows`) filters by the same function over the
same ranking. JSON-LD of an indexable hero page: the entity graph plus a
`Dataset` with `isAccessibleForFree: false` and
`hasPart.cssSelector: ".paywalled-hero"`.

Tests: `tests/battleground-hero-ranking-public.check.ts` (stats projection,
indexing rule, parser, route), `tests/next-bg-hero-detail-browser.test.mjs`
(built page: HTML, RSC payload, JSON-LD, closed marks) and
`tests/entity-sitemap-sources.test.ts` (hero segment filter).

## Hero detail layout

The header holds everything a player checks first: the portrait, the name, a
row of fact chips (armor, the latest balance change or that there was none,
Hearthstone Wiki and HSReplay links), the four statistic plaques, and compact
hero power and buddy plates that open the media viewer. The profile panel
appears only when the library has a description, race or artist. The patch
history appears only when the hero has recorded balance changes; the header
chip links to it. The loading skeleton mirrors this header and the profile panel.

Every section below the header has one rail frame and a light parchment fill;
nothing inside a section is framed again. Charts and lists sit straight on the
section and are separated by space and `--arena-paper-line` rules.

### Statistics

The statistics section names the games behind the numbers in one line (mode,
rating bracket, period from `stats.mode` and `stats.filters`; data from
HSReplay) and switches four tabs. A tab without data says so; a chart without
points is not drawn. Panels live in `src/modules/battlegrounds/ui/HeroAnalytics.tsx`
on the shared `src/shared/ui/analytics` charts, with the site palette: winrate
red `#8d171d`, share blue `#2f6c9e`, tavern tiers on one warm scale.

- **Обзор**: places 1–8 as columns (top four in red, the top-4 share in the
  subtitle) and the combat winrate by round as a line against 50%
  (`stats.combat_winrate`).
- **Сила героя**: the share of games that use the hero power on each turn, and a
  turn × tavern tier table of that share (`stats.hero_power`); cells with fewer
  than 50 games are faded.
- **Таверна**: the usual upgrade pace — the first turn each higher tier becomes
  the most common one (`stats.tavern_up_by_turn`) — and the tier distribution by
  turn as 100% bars with a hover card (`stats.tavern_up`).
- **Составы**: the best composition's typical final board, every composition in
  one list ordered by games (share bar, average place ± interval, games;
  fewer than 100 games are dimmed with an ⓘ), and the key minions of the final
  board grouped by the tavern tier the game ended on. A tier group where every
  minion is on 100% of boards is a single game and is left out.
  Every final-board slot is a full card of the base card id (`heroCardImageSources`):
  the HearthstoneJSON Battlegrounds render, or the golden card
  `db/uploads/golden/<base>.png` with one star marker for a golden minion —
  never a framed portrait or a `_G` render. Attack and health under a card are
  the average end-of-game stats, grouped by thousands. Tribe icons are one set
  of round badges. A minion name shows its full card beside it on hover or
  focus (`AnchoredImagePreview`, portalled, kept in the viewport).
  The BG app's details carry `cards` only for the lineup, so the proxy
  (`server/battlegroundHeroCards.ts`) adds a library card for every lineup and
  final-board minion from `/api/bg/library/cards/by-dbf/:dbf` before caching:
  the Russian name, tier, tribe and `base_card_id`. A failed lookup
  leaves the English name.

### Patch history

`battlegroundHeroPatchEntries` (`src/features/battlegroundHeroPatchChanges.ts`)
merges the wiki groups "Card changes" and "Bug fixes and other changes" by
patch and turns each line into a short Russian change with a direction: armor
(solo, Duos, lower ratings) and armor tier up is a buff, down a nerf; health,
hero power cost and text follow the card grammar; added to or removed from the
pool, a new hero power and lobby restrictions are named. Raw tag diffs, art
credits, rarity and class notes and unparsed English bug notes fold into the
quiet "Ещё" line. The version keeps the hotfix number (`Патч 36.4.2`). The
section uses the card page timeline (`CardPatchTimeline`) with hero badges
(«Добавлен», «Убран»), the Manacost article and wiki links, and shows the five
newest patches with a button for the rest. The header chip names the latest
patch with a gameplay change, not a cosmetic one.

The hero rating lays its portrait cards out with `auto-fill`, so a tier shows
as many heroes per row as fit (two on a phone) instead of four wide cards.
