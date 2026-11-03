# SEO entity indexing: cards, library and tier-list discovery

## Objective

Make every existing, useful HearthPulse entity page discoverable through a
canonical sitemap segment and understandable before client JavaScript runs.
The first release covers Standard and Wild cards, Battlegrounds minions and
spells, and Battlegrounds heroes. It also strengthens the crawl path between
those detail pages, their libraries and the relevant tier lists.

This work improves discovery signals; it does not promise that a search engine
will index every submitted URL or rank it for a particular query.

## Indexing contract

- Each sitemap contains only absolute `https://hearthpulse.net` canonical URLs
  that resolve to a useful public detail page.
- Standard cards are canonical in the Standard segment. The Wild segment
  contains only cards that are not present in Standard, avoiding duplicate
  entity pages across formats.
- Battlegrounds minion and spell segments include the active pool and archive
  because both states have visible, entity-specific reference content.
- The hero segment contains the de-duplicated union of solo and Duos heroes.
- Search, filter, sort, authentication and other query-state URLs never enter
  an entity sitemap.
- A missing, malformed or materially collapsed upstream catalog never replaces
  the last known good sitemap snapshot.
- `lastmod` changes only when the public semantic projection of an entity
  changes. The first observation does not invent a historical modification
  date. The one exception is a segment whose source states the date of its
  data (archetypes, below): that day is the date of a first observation too.
- The archetypes segment lists only Standard archetype pages that pass
  `isIndexableArchetype` (see «Archetype pages»); Wild, the legacy
  `/standard/meta/…` family and archetypes below the threshold never enter it.

## Page contract

Each included detail page must return:

- HTTP 200 with `index, follow` for a verified entity;
- one self-canonical URL and matching Open Graph URL;
- a unique title, description and H1 derived from public entity data;
- server-rendered visible facts and an entity image;
- JSON-LD containing `WebPage`, the described `CreativeWork`, and a
  `BreadcrumbList` matching visible navigation. The `WebPage` has
  `@id` `<canonical>#webpage`, `inLanguage: "ru"` and `isPartOf` pointing at
  the site node `https://hearthpulse.net/#website`; the entity has the
  fragment `#card` or `#hero` and an `image` when the page has a picture. One
  builder, `buildEntityStructuredData` in `shared/entitySeoStructuredData.ts`,
  serves the Express documents and the Next.js pages;
- a `BreadcrumbList` repeats the words and links of the breadcrumb the page
  shows. A Standard or Wild card shows «Карты» (a link to
  `/standard/cards/<format>/`) / «Стандарт» or «Вольный» / the card name, so its
  list has those three steps with absolute canonical URLs and a trailing slash:
  the first two lead to `/standard/cards/<format>/` (the format step has no
  link of its own on the page) and the third is the card. The Express fallback
  document keeps its own shorter path (home › library of the format › card);
- a card library listing (`/standard/cards/`, `/standard/cards/<format>/`)
  shows no breadcrumb, so its steps take the words the page does show: «Главная»
  (footer link), «Карты» (heading) and «Стандарт» or «Вольный» (format switch).
  It is a `CollectionPage` `<canonical>#collection` with `inLanguage`,
  `isPartOf`, the `ItemList` of the current page (`numberOfItems` is the
  catalog total, positions run through the pages) and a `BreadcrumbList`: home ›
  «Карты» (`/standard/cards/`) (› format, except on the library root, which has
  no format step of its own). `buildCollectionStructuredData` builds it;
- ordinary `<a href>` links back to the owning library and to complementary
  tier-list or meta pages;
- HearthPulse as the site brand, without implying ownership of Hearthstone or
  affiliation with third-party data sources.

Invalid or unverifiable entities remain authoritative `404` or retryable `503`
documents with `noindex, nofollow`, no canonical and no client reclassification.

A page component cannot choose its HTTP status, so on Next.js
`apps/public-web/proxy.ts` asks the entity's public Express projection before
the page renders. A `404` stays the page's own not-found document; any other
failure becomes the `503` document with the projection's `Retry-After`, or
300 seconds when it gives none. A card
catalog served from its last-known-good copy cannot prove that a card is
absent, so an unknown card is `503` until the next fresh catalog load. The
release monitor (`scripts/production-monitor.mjs`) accepts that `503` for its
absent-card probe only while the card API reports `X-Data-Cache: LKG`.

## Architecture and project structure

- `server/entitySitemapRoutes.ts` owns segment definitions, public sitemap
  projections and XML responses.
- `server/entitySitemapStore.ts` owns generic, segment-scoped semantic snapshots
  and last-known-good recovery.
- Entity SSR route modules remain the source of public page projections and
  metadata.
- `config/public-seo-pages.json` is the source of static hub titles and
  descriptions, and `config/public-seo-structured-data.json` of their JSON-LD.
  Next.js renders both (`apps/public-web/lib/seoPageMetadata.ts`,
  `apps/public-web/ui/SeoStructuredData.tsx`); every registry page, including
  the prerendered ones and the noindex `/connect` and `/admin`, takes its title
  and description from the registry, which
  `tests/next-seo-page-metadata.test.mjs` checks.
- Pages with a free teaser (`/standard/meta`, `/standard/archetypes`) carry the
  date of their data in the snippet. Their registry entries hold the static
  `title` and `description` (only `{year}` allowed; the text without data) and
  the templates `dataTitle` and `dataDescription` with the tokens listed in
  `SEO_DATA_TOKENS` (`src/seo/registry.ts`). `[ … ]` marks an optional group
  that drops out when its value is missing or the text exceeds 65 characters
  (title) or 160 (description), last group first
  (`src/seo/dataTemplate.ts`). `generateMetadata` renders them with values built
  by `apps/public-web/lib/seoDataValues.ts` from the same cached teaser loader
  the page uses, so metadata adds no second Express read. Without a teaser or a
  readable date it falls back to the static text.
- The date of the data is the teaser's `updatedAt` in Moscow time
  (`apps/public-web/lib/seoDataDate.ts`), never the server clock. The title
  carries the month («октябрь 2026»), the description the full date («на 29
  октября 2026»). Data older than seven days loses the month in the title and
  says «обновлено <дата>» in the description. The meta description names a
  leader only for a teaser row with at least 1000 games and never prints the
  sample size (the guest total is a sum of three rows). The period label comes
  from `standardMetaPeriodLabel`.
- An archetype page is not a registry page: its formula is in
  `apps/public-web/lib/seoDataValues.ts` (`archetypeDetailSeoText`) and is used
  by `apps/public-web/lib/publicArchetypeRoute.ts`. Given the public catalog of
  the page's format it also tells a name shared with another row apart: the
  title becomes «Чистый Паладин (Pure Paladin) — колода Hearthstone, …» (the
  English name; the slug when that is the name too). See «Archetype pages».
- `/standard/meta` shows the same date, slice and source as a server-rendered
  line below the meta page (`apps/public-web/ui/StandardMetaDataNote.tsx`,
  passed to the client page as `children`).
- Contract tests live in the existing entity sitemap and SEO route test files.

No new dependency, database migration or public JSON API is introduced.

## Commands

- Focused sitemap tests: `npm run test:entity-sitemaps`
- Standard entity SSR: `npm run test:constructed-card-seo-routes`
- Battlegrounds hero SSR: `npm run test:battleground-seo-routes`
- Battlegrounds card SSR: `npm run test:battleground-library-seo-routes`
- Static SEO tests: `npm run test:seo-registry && npm run test:next-seo`
- Full release gate: `npm run verify:release`
- Repository gate: `make check`

## Testing strategy

1. Add failing contract tests for every sitemap segment and entity-page schema.
2. Generalize the semantic snapshot store while preserving the existing
   Standard snapshot format and recovery behavior.
3. Add the smallest segment loaders/projections and verify catalog collapse,
   duplicate and outage behavior.
4. Update server-rendered entity metadata and internal links, then verify
   browser DOM, canonical, console and network behavior.
5. Run release, security, integration and production smoke gates before closing
   the task.

## Safety boundaries and rollback

- Subscriber statistics, deck codes, cookies, authorization state and private
  payloads must not affect or appear in sitemap XML, HTML or JSON-LD.
- Catalog requests have bounded deadlines. A cold failure returns `503`; a warm
  failure serves only a checksum-valid last-known-good snapshot.
- The current Standard sitemap URL remains stable for backward compatibility.
- Rollback is a normal commit revert; stored snapshots are additive files and
  require no destructive migration.

## Success criteria

- The sitemap index advertises static, Standard, Wild-only, Battlegrounds
  minion, Battlegrounds spell, Battlegrounds hero, cosmetics, guides-archive
  and archetypes segments.
- Every URL in each entity segment is unique, canonical, parameter-free and
  within protocol limits.
- Entity SSR pages use HearthPulse branding, expose aligned `WebPage`, entity
  and breadcrumb schema, and link to relevant libraries and tier lists.
- Tier-list and library hubs retain unique intent-aligned metadata and explain
  how to reach detail pages.
- Focused tests, full project gates, browser review and production smoke pass.

## Archetype pages (E9 S3a)

`/standard/archetypes/:format/:archetypeSlug/` is an indexable detail type, but
page by page. The rule is `isIndexableArchetype`
(`shared/constructedArchetypeIndexing.ts`), the single reader of which is the
page's metadata and JSON-LD and the sitemap source of the Express server
(«Archetype sitemap segment»): format Standard, at least
`INDEXABLE_ARCHETYPE_MIN_GAMES` (1000) games, at least one build and a
popularity above zero. At the 2026-10-29
catalog that is 72 of 196 Standard archetypes. Wild is never indexable.

- Indexable: HTTP 200, `index, follow` with the preview directives
  (`policy.robots`), self-canonical, the JSON-LD below and a unique title.
- Below the threshold and every Wild archetype: `noindex, follow`, self
  canonical, no JSON-LD. The route inventory keeps the listing level
  (`constructed-archetype-detail`: `index`, `sitemap: true`, `server-ssr`) and
  `apps/public-web/lib/publicArchetypeRoute.ts` narrows it per page.
- The legacy `/standard/meta/:format/:archetypeSlug/` family is not a page any
  more (E9 S3b, #298): nginx answers one `301` to the same slug under
  `/standard/archetypes/…`, with or without the slash, keeping the query
  string (inventory `standard-meta-legacy-detail`: `kind: redirect`,
  `expectedStatus: 301`). A Next response served without nginx names the
  `archetypes` URL as its canonical and stays `noindex, follow` without JSON-LD.
- nginx puts no `X-Robots-Tag` on a successful Standard archetype, so the
  page's meta robots decide; a header the app sends passes through unchanged.
  It keeps `noindex, follow` on Wild (a second layer until Wild's own phase)
  and `noindex, nofollow` on every `4xx`/`5xx`
  (`$arena_next_archetype_robots_header` in `deploy/nginx/arena-seo-map.conf`).
- Every archetype page, indexable or not, renders the server-side summary
  (`apps/public-web/ui/ArchetypeSeoSummary.tsx`, passed to
  `ArchetypeDetailPageClient` as `children`, so the client bundle only grows by
  the pass-through): a question heading («Насколько силён <Архетип> в Стандарте
  сейчас»), an answer in the first 40–60 words (winrate, popularity, games and
  builds as of the `<time datetime>` date, the HSGuru period), the comparison
  with the median winrate of the format and of the class (rows of the public
  catalog with at least 1000 games; a median over fewer than 5 or 3 rows is not
  printed), the place by games, how to read the numbers («от N игр»), the
  «Источник: HSGuru» link, a sentence that builds and deck codes are for
  subscribers (no values) and 4–6 links to archetypes of the same class
  (indexable first). 150–250 words. The word «лидер» is not used: a ranking
  word needs a sample threshold. A share above zero that rounds to zero is
  printed «менее 0,1%». When two catalog rows share a Russian name, the English
  one follows it in brackets in the title, the heading, the first sentence and
  the links (the H1 stays as the page prints it). Without the catalog (it did
  not answer within the first-paint budget) or with fewer than three archetypes
  of the class to link, a short neutral primer («Что такое архетип», no catalog
  numbers) replaces the comparison and the links, so the text keeps its length.
  Builds, deck codes, history and analysis never reach the HTML or the RSC
  payload, and the summary and the JSON-LD do not use the numbers of
  `featuredBuild` (the public teaser carries them and the page's «Главная сборка»
  block shows them); the sentinel test in `tests/next-seo-page-metadata.test.mjs`
  fails on any leak.
- JSON-LD only for an indexable archetype, built by `archetypeStructuredDataGraph`
  (`src/seo/archetypeStructuredData.ts`) through the same finishing step as the
  registry pages (`seoStructuredDataGraphOf`): `Organization` `#org`,
  `BreadcrumbList` («Архетипы» › the archetype; the format step of the visible
  trail has no address of its own and is left out), `ItemPage` (title and
  description of the meta, `dateModified` = `updatedAt`) and `Dataset`
  (`isBasedOn` = the teaser's HSGuru `sourceUrl`; `variableMeasured` carries
  the teaser's winrate, popularity and games as they are, a metric the source
  lacks is omitted). This is the one place where a `Dataset` has values: they
  are the open numbers of this single entity, repeated verbatim in the visible
  text, and the test checks that each is in the public teaser. `isAccessibleForFree`
  is not written: the numbers it describes are free, and the paid parts are not
  described at all.

### Archetype sitemap segment (E9 S3c)

`/sitemaps/archetypes.xml`, the last segment of `/sitemap.xml`. Its entries are
`https://hearthpulse.net/standard/archetypes/standard/<slug>/` of the Standard
archetypes that pass `isIndexableArchetype` (72 of 196 at the 2026-10-29
catalog) and nothing else.

- **Source.** The catalog the archetype pages open on:
  `loadArchetypeCatalogForPeriod(constructedArchetypeCatalogCache.load, 'standard')`
  in `server/index.ts`, the same call as the page's teaser, so a listed page is
  one the page finds in the same catalog. `selectIndexableArchetypeRows`
  (`server/entitySitemapSources.ts`) applies the shared rule, with no copy of
  it. The page serves the first catalog row of a slug, so a later row with the
  same slug is never listed. The projection
  (`projectConstructedArchetypeSitemapCatalog`) checks the rule again and
  rejects the whole candidate on a page the rule keeps out, so a wrong wiring
  produces the last good segment, not a `noindex` URL in the sitemap.
- **`lastmod`.** The UTC day of the catalog's `updatedAt` (hs-data-api
  `fetched_at`), the same date the page prints as `dateModified`; never the
  day of the request or of the refresh. It is set when an archetype is first
  listed or when its semantic hash changes, and kept while the numbers hold
  still. The semantic hash covers what the page prints: slug, English and
  Russian name, class, games, winrate, popularity, turns, duration, climbing
  speed, number of builds, HSGuru link and period. Builds and deck codes are
  not read. With the catalog refreshing daily and games growing, the date in
  practice follows the catalog; an archetype whose numbers did not move keeps
  its older date. The store never sets a date ahead of today and never moves a
  date back. A catalog without a valid `updatedAt` cannot date `lastmod`: the
  candidate is rejected.
- **Guard against empty and truncated candidates.** The segment has a floor,
  `SITEMAP_ARCHETYPES_MIN` (default 30, integer 1–50000). A candidate below it,
  an empty one, a catalog that is not Standard or an unreadable one leaves the
  last good segment (`X-Sitemap-Source: last-known-good`); with no good segment
  yet the answer is `503` with `Retry-After`. The relative guard that protects
  the other segments (a candidate below 90% of the last good count is
  rejected) is **off** here: the number of indexable archetypes follows the
  catalog's period and moves by far more than a tenth (72 can become 40 after
  a patch and grow back), and that is a change of the data, not a truncation.
  The floor is the only count guard, so after a patch that leaves fewer than
  30 archetypes above the games threshold the segment stays on its last good
  state until enough of them cross it; lower the floor then rather than
  disabling the check.
- **Lifecycle.** An archetype that falls out of the catalog answers `404`
  (`noindex`) and leaves the segment at the next refresh. One that drops below
  the threshold keeps a `noindex, follow` page and leaves the segment the same
  way. Between the data change and the refresh the segment may still list the
  page: the sitemap document cache (10 minutes by default, 5–15) plus the
  catalog cache (5 minutes).
- **Monitor** (`scripts/production-monitor.mjs`, `docs/runbooks/production-monitor.md`):
  the exact index, at least 30 unique URLs of the `archetypes` pattern with no
  query, SHA-256 `ETag`, `X-Sitemap-Source`, then five URLs spread over the
  list: `200`, no `noindex` in `X-Robots-Tag`, one H1, meta `index`, canonical
  equal to the `loc`, and a JSON-LD block that describes that URL.
- nginx needs no change: `location ^~ /sitemaps/` already proxies every
  segment to Express.

## JSON-LD of statistics pages

The `Dataset` nodes of `config/public-seo-structured-data.json` (meta,
archetype catalog, matchups, Vicious Gold, arena classes and tier list) say
only what the page itself shows:

- A date or a window in the markup comes from the data, never from the clock
  of the server. `dateModified` is the `updatedAt` of the public teaser the
  page prints (`<SeoStructuredData data={teaser}>`), written as a full ISO
  instant, the same value as the `<time datetime>` of the data line. A page
  with no public date (no teaser, an unreadable date, a date more than a day
  ahead) has no `dateModified`; stale data keeps its real date. The date goes
  on `Dataset` and `CollectionPage` nodes. `temporalCoverage` is not written at
  all: no source names the window it covers, and a sliding 30 days would be a
  guess. It returns when a source supplies the bounds.
- `/standard/meta/` has its own `Dataset` (the only page with a public teaser
  and a fresh date) linked from its `CollectionPage` through `about`.
- Every `Dataset` has `isBasedOn` with the name and address of the original
  source (HSGuru, Vicious Syndicate, HSReplay, HearthArena, Firestone) and
  `variableMeasured` with metric names only, never values. The meta
  `isBasedOn` address is the teaser's `sourceUrl` when it is an https address on
  HSGuru, otherwise the registry one. The graph carries no numbers of the
  teaser, no deck codes and no paid fields.
- `creator` and `publisher` of a `Dataset` point at `{"@id":
  "https://hearthpulse.net/#org"}`, and the builder adds that `Organization`
  node (`organization` in the registry: name, url, logo) to the graph of every
  page with a `Dataset`: Google does not resolve an `@id` from another
  document. `license` stays the site terms.
- A `Dataset` whose values only subscribers see (arena classes, arena tier list)
  has `isAccessibleForFree: false` and a description that says so; it names no
  figure and nothing the visible text of the page does not explain.
- There is no `about.gameMode` (not a schema.org property): the mode is in the
  name and the keywords. Contents lists without a URL per item are not
  `ItemList`s, so the tier-list, legendaries and Battlegrounds tier-list pages
  have none, and no registry node holds a hard-coded `numberOfItems`.

## Arena pages: methodology text (E9 S4a)

`/tierlist/`, `/classes/` and `/legendaries/` show a guest the page frame and a
paywall: their data sits behind the `arena` entitlement and there is no public
teaser. Without text of their own they weigh less than the 404 page in the HTML,
while «тир лист арены», «арена хс какой класс» and «легендарки арены» are among
the queries the site wants to answer.

- Each page renders a server-side block of 250–400 words
  (`apps/public-web/ui/SeoPageIntro.tsx`, passed to the client page as
  `children`, so the client bundle only grows by the pass-through), inside
  `<main>` below the H1. Every section is headed by a question («Что показывает
  тир-лист Арены Hearthstone (хс)?», «Как читать оценки от S до F?», «Откуда
  берутся оценки и как они обновляются?», «Что доступно без подписки?»).
- The text is data, not code: `config/public-seo-page-copy.json`, read through
  `src/seo/pageCopy.ts` (`parseSeoPageCopy` rejects a page outside the SEO
  registry, a heading that is no question, an empty block and a link that is not
  the canonical address of a registry page). A paragraph is a string, a bullet
  list an array of strings, `[text](/path/)` a link. The title and the
  description stay in `config/public-seo-pages.json`; there is no second source.
- It states only what the code and `public/llms.txt` state: the S–F scale and
  its Russian labels (`server/index.ts` `TIER_LABEL_FULL`, `TIER_DESC_MAP`),
  the sources of each page (tier list: HSReplay, HearthArena, Firestone; classes:
  HSReplay, Firestone as the reserve; legendaries: HSReplay, Firestone) and the
  level that opens the figures («Любитель Арены»). The scale is not the same in
  every source: HSReplay's letter comes from the Arenasmith Score and stops at E
  (`server/hsreplayArenasmith.ts` `tierFromArenasmithScore`), HearthArena and
  Firestone use all seven letters, and «Без тира» (a card without Arenasmith
  Score in the current HSReplay slice) is a mark, not a grade.
- **It promises no update frequency.** `deploy/hs-arena-scraper.timer` (every 6
  hours) is the schedule of the scraper, not how often the datasets behind the
  pages change. The Data API has its own timers: an evening refresh once a day
  (`hs-data-api-docker-refresh-api.timer`), five runs a day only in the
  post-patch window (`…-refresh-post-patch-tierlists.timer`) and the HSReplay
  Arena classes every second day
  (`…-refresh-hsreplay-arena-classes-firecrawl.timer`). The text says «данные
  обновляются автоматически», and so do the descriptions, the `Dataset` and
  `llms.txt`. A frequency may return only when the Data API or HearthPulse code
  confirms it per dataset.
- **It contains no statistics**: no digit, no percentage, count or ranking.
  Whether any Arena figure becomes public is the owner's decision (#310);
  until then the tests fail on a digit, a `%` or a frequency phrase in the
  block, the `Dataset` and the descriptions.
- «хс» appears only next to the game's name («Hearthstone (хс)»): alone it
  also means Honkai: Star Rail.
- Titles are static with the year, no teaser exists to date them:
  «Тир-лист Арены Hearthstone (хс), {year}», «Винрейт классов Арены
  Hearthstone, {year}», «Легендарки Арены Hearthstone, {year}». The classes
  title starts with «Винрейт классов» and its description keeps «винрейты всех
  11 классов» because the client navigation check in `scripts/e2e-qa.mjs`
  waits for both. The descriptions are at most 160 characters and say that
  access is by subscription.
- The `Dataset` of `/classes/` and `/tierlist/` has `isAccessibleForFree: false`
  and a description that names the same sources and the same subscription as
  the text and no figure or frequency; `tests/seo-structured-data.test.ts`
  compares the two. `/legendaries/` has no `Dataset`.
- Tests: the HTML Next serves (`tests/next-seo-page-metadata.test.mjs`) for the
  word count, headings, the absence of figures and frequency phrases, the scale
  of the tier list and the 150 words over the 404 frame;
  `tests/seo-structured-data.test.ts` for the copy parser and the dataset.

## Documentation impact

- This specification records the new sitemap segment and page-quality contract.
- `docs/roadmaps/SEO-STRATEGY.md` marks the hero/Battlegrounds/Wild sitemap
  slice complete and records the remaining article/additional-entity scope.
- `CHANGELOG.md` records the user-visible release.
- No ADR is required: the implementation extends the already accepted
  canonical and semantic-LKG architecture without changing its decision.
