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
- The hero segment contains the de-duplicated union of solo and Duos heroes that
  pass `isIndexableBattlegroundHero` (see «Порог индексации»).
- Search, filter, sort, authentication and other query-state URLs never enter
  an entity sitemap.
- A missing, malformed or materially collapsed upstream catalog never replaces
  the last known good sitemap snapshot.
- `lastmod` changes only when the public semantic projection of an entity
  changes; every address has one (rules: `docs/specs/seo-foundation.md`,
  «`lastmod` semantics»). A first observation takes the date its source
  states (archetypes: the catalog's `updatedAt`; guides: the publication day),
  else the day of first sight.
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
- `/standard/meta` has no visible line with the date, slice and source under
  the table: the page ends with the data. The same date and source stay in the
  meta description (above) and in the JSON-LD (`dateModified`, `isBasedOn`).
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
(«Archetype sitemap segment»): format Standard with at least
`INDEXABLE_ARCHETYPE_MIN_GAMES` (1000) games or format Wild with at least
`INDEXABLE_WILD_ARCHETYPE_MIN_GAMES` (5000) games (#543; both numbers live in
`shared/seoIndexThreshold.ts`, `INDEX_MIN_SAMPLE_GAMES`), at least one build and
a popularity above zero. At the 2026-10-29 catalog that is 72 of 196 Standard
archetypes; at the 2026-11-20 one, 43 of 500 Wild archetypes (the Wild sample
is thinner: three of four have fewer than 500 games). Any other format is never
indexable.

- Indexable: HTTP 200, `index, follow` with the preview directives
  (`policy.robots`), self-canonical, the JSON-LD below and a unique title.
- Below the threshold of its format: `noindex, follow`, self canonical, no
  JSON-LD. The route inventory keeps the listing level
  (`constructed-archetype-detail`: `index`, `sitemap: true`, `server-ssr`) and
  `apps/public-web/lib/publicArchetypeRoute.ts` narrows it per page.
- The legacy `/standard/meta/:format/:archetypeSlug/` family is not a page any
  more (E9 S3b, #298): nginx answers one `301` to the same slug under
  `/standard/archetypes/…`, with or without the slash, keeping the query
  string (inventory `standard-meta-legacy-detail`: `kind: redirect`,
  `expectedStatus: 301`). A Next response served without nginx names the
  `archetypes` URL as its canonical and stays `noindex, follow` without JSON-LD.
- nginx puts no `X-Robots-Tag` on a successful archetype page, Standard or Wild
  (#543 removed the Wild edge layer), so the page's meta robots decide; a header
  the app sends passes through unchanged. Every `4xx`/`5xx` gets
  `noindex, nofollow` (`$arena_next_archetype_robots_header` in
  `deploy/nginx/arena-seo-map.conf`).
- The Wild catalog has its own server-rendered list, `/standard/archetypes/wild/`
  (#543; inventory `constructed-archetypes-wild`): every archetype of the Wild
  catalog with winrate, popularity and games, the date and the source, and a
  link to each page, without JavaScript. The format switch of both lists is two
  links, the menu item «Вольный → Архетипы» and the «Вольный» step of a Wild
  archetype's breadcrumb lead there, and the old `/standard/archetypes/?format=wild`
  still opens Wild. nginx adds the slash with one `301` (on the old hosts too,
  `$arena_canonical_edge_path`). Until SEO-A opens it, the list is
  `noindex, follow`, has no canonical and no JSON-LD and stays out of the
  sitemap (`canonicalPolicy: none`, `sitemap: false`); the archetypes segment
  still lists Standard pages only.
- Every archetype page, indexable or not, renders the server-side block
  (`apps/public-web/ui/ArchetypeSeoSummary.tsx`, passed to
  `ArchetypeDetailPageClient` as `children`, so the client bundle only grows by
  the pass-through). Owner rule (#570): no paragraphs written for a robot at
  the bottom of a page, only interface a reader sees, all of it in the server
  HTML. The block is a heading («Среди архетипов Стандарта»), plates «Место по
  играм N из M», «Медиана формата» and «Медиана класса» (the median winrate
  over rows of the public catalog with at least 1000 games, the archetype's
  difference in percentage points, «среди N архетипов … от 1 000 игр»; a
  median over fewer than 5 or 3 rows is not shown), a line «date (`<time
  datetime>`) · period · Источник: HSGuru», a one-line hint for a sample under
  1000 games, a `<nav>` «Другие архетипы <класса>» (up to 6 links with name and
  winrate, indexable first) and «Все архетипы <формата>». The word «лидер» is
  not used: a ranking word needs a sample threshold. When two catalog rows
  share a Russian name, the English one follows it in brackets in the title and
  the links (the H1 stays as the page prints it). Without the catalog (it did
  not answer within the first-paint budget) the plates and the class links are
  left out; the date, the source and the catalog link stay. The indexable page
  meets `shared/seoIndexThreshold.ts` through its open builds with card lists
  and the plates (150 own words or 10 own facts).
  History and analysis never reach the HTML or the RSC
  payload, and the block and the JSON-LD do not use the numbers of
  `featuredBuild`; the sentinel test in `tests/next-seo-page-metadata.test.mjs`
  fails on any leak.
- JSON-LD only for an indexable archetype, built by `archetypeStructuredDataGraph`
  (`src/seo/archetypeStructuredData.ts`) through the same finishing step as the
  registry pages (`seoStructuredDataGraphOf`): `Organization` `#org`,
  `BreadcrumbList` («Архетипы» › the archetype; the format step of the visible
  trail is left out: Standard's has no address of its own and Wild's list is
  `noindex` until SEO-A opens it), `ItemPage` (title and
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
archetypes that pass `isIndexableArchetype` (about 77 of 240 at the
2026-11-16 catalog: 76 of the 199 archetypes of the current patch window
`patch_37.0.2` plus one that only the Bans window lists) and nothing else.

- **Source.** The windows the archetype pages read, in the order the page
  looks a slug up (`loadArchetypeCatalogWindows` in
  `server/constructedArchetypeCatalogPeriod.ts`: the default window, which is
  the current patch, then the Bans window, then the source window). The
  teaser of a page (`loadArchetypeCatalogForSlug`) takes a slug from the first
  window that lists it, so the sitemap judges a slug in that window only: a
  slug that is thin in the patch window is not rescued by the Bans window,
  and a slug the patch window lacks but the Bans window lists (the page answers
  200 there) is listed from the Bans window. `selectIndexableArchetypeRows`
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
  catalog's period and moves by far more than a tenth (77 can become 40 after
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
- A `Dataset` has `publisher` = `{"@id": "https://hearthpulse.net/#org"}`, and
  no `creator` and no `license`; the one `Organization` node is added to every
  graph. See `docs/specs/seo-structured-data.md`.
- A `Dataset` whose values only subscribers see (arena classes, arena tier list)
  has `isAccessibleForFree: false` and a description that says so; it names no
  figure and nothing the visible text of the page does not explain.
- There is no `about.gameMode` (not a schema.org property): the mode is in the
  name and the keywords. Contents lists without a URL per item are not
  `ItemList`s, so the tier-list, legendaries and Battlegrounds tier-list pages
  have none, and no registry node holds a hard-coded `numberOfItems`.

## Arena pages: no explanation text (E22 D1)

`/tierlist/`, `/classes/` and `/legendaries/` show a guest the page frame and a
paywall (the tier list and classes also an open slice of their data). Until E22
they carried a server-rendered «О странице» block (100–180 words, question
headings, kept as a JSON data file) to give search engines text. The
owner decided on 2026-11-19 that the pages end with their data and the block was
removed with its component, data file, loader, styles and tests. The expected
SEO cost is 250–400 words fewer on three indexed pages.

- The pages carry no FAQ or other markup about text they do not show.
- The `Dataset` of the three pages keeps `isAccessibleForFree:
  false`, names its sources and the subscription and states no figure or update
  frequency (`deploy/hs-arena-scraper.timer` is the scraper's schedule, not the
  refresh rate of the datasets). The `/classes` description no longer
  mentions a reading guide.
- Titles and descriptions come from the open data the page prints (#539,
  `config/public-seo-pages.json` `dataTitle`/`dataDescription`, values in
  `apps/public-web/lib/seoDataValues.ts`): the month of the data in the title,
  the date and open figures in the description, each one printed on the page —
  `/tierlist` the rounded sample («более 53 000 игр»), `/classes` the first
  class of the open
  order with its winrate, `/legendaries` the number of groups and the group with
  the best winrate, `/heroes` the number of heroes of the solo ranking (numbered
  rows) and its first hero with the average place, named «в Соло»,
  `/battlegrounds/tier-list` the tribes of tier S (no count of builds: the page
  prints none). The templates name HSReplay, so another
  source, data older than a week (no month; «обновлено <дата>») or no data at
  all fall back as `seoPageText` does: stale data keeps the date, missing data
  gives the static text with the year. No paid figure (offer rate, ArenaSmith
  score, narrow ranges) enters a snippet. The static descriptions name the
  open data and say which part is for subscribers.
- `/standard/matchups` and `/standard/patches` follow the same rule (#540):
  the matchups title and description carry the date of the open Standard
  slice only (the page prints no count of archetypes or games); the patch
  notes title names the version the page shows first (the newest, or
  `?version=`) and the description its release date (`publishedAt`, never the
  request time), without a count of changes the page does not print. The
  Battlegrounds builds description names up to three tribes of tier S, then
  «и другие».
- Static titles: «Тир-лист Арены Hearthstone (хс), {year}», «Лучшие классы
  Арены Hearthstone, {year}», «Легендарки Арены Hearthstone, {year}», «Тир-лист
  героев Полей сражений Hearthstone {year}», «Сборки Полей сражений
  Hearthstone: тир-лист {year}» (the Russian word of the Battlegrounds cluster
  is «сборки», research/seo-ru-demand-2026-10.md). The classes title starts
  with «Лучшие классы» and both of its descriptions keep «винрейты всех 11
  классов», which the client navigation check in `scripts/e2e-qa.mjs` waits
  for.
- «хс» appears only next to the game's name («Hearthstone (хс)»): alone it
  also means Honkai: Star Rail.
- Tests: `tests/next-seo-page-metadata.test.mjs` (titles, descriptions, no
  explanation block, no FAQ markup, paywall present, dataset claims) and
  `tests/seo-structured-data.test.ts` (dataset).

## Порог индексации (E21 S5)

Одно правило на сайте: страница либо `index` + в карте сайта + canonical на
себя, либо `noindex` + вне карты. Порог записан в одном модуле,
`shared/seoIndexThreshold.ts`; meta robots страницы и проекция карты сайта
импортируют его предикаты, второй копии условия нет.

- Содержание: не меньше `INDEX_MIN_OWN_WORDS` (150) собственных слов или
  `INDEX_MIN_OWN_FACTS` (10) собственных фактов, без меню и футера
  (`meetsContentThreshold`).
- Выборка по шаблону: `INDEX_MIN_SAMPLE_GAMES`, единственный источник
  числа. Для архетипов это 1000 игр;
  `constructedArchetypeIndexing.ts` читает его (прежнее имя
  `INDEXABLE_ARCHETYPE_MIN_GAMES` — то же значение) и решает через
  `meetsSampleThreshold`, так что страница и проекция карты сайта идут по
  одному правилу.
- Видимость: `indexThresholdNotice({ games, minGames })` возвращает строку
  «Мало данных: N игр из нужных M, страница не индексируется до набора
  выборки» либо `null`. Её печатает строка свежести данных страницы.
- Контракт-тест `tests/route-inventory.test.ts`: у каждого маршрута инвентаря
  `index` равносильно `sitemap`; у `index` canonical на себя и статус 200; ни один
  сегмент карты не содержит шаблон с `noindex`; архетип ниже порога
  не попадает в сегмент архетипов (проекция отклоняет его).
- Герои Полей сражений: `isIndexableBattlegroundHero`
  (`shared/battlegroundHeroIndexing.ts`) сначала требует оба режима (Соло и
  Дуо), затем считает имя героя, название силы героя и открытые цифры
  страницы (тир, среднее место, топ-4, выбор, выборка, сборка, ключевые
  существа, место в рейтинге) и сравнивает с `INDEX_MIN_OWN_FACTS`. Её читают
  meta robots страницы `/heroes/<id>/` и сегмент героев карты сайта; герой
  оценённый в одном режиме (как бы полно) — `noindex, follow`, без JSON-LD и
  вне карты.
- Карточки библиотеки Полей сражений: `isIndexableBattlegroundLibraryCard`
  (`shared/battlegroundLibraryIndexing.ts`) считает название, тип, уровень
  таверны, племя, атаку, здоровье, текст, каждую механику, атаку и здоровье
  золотой версии и четыре цифры открытой статистики (среднее место с картой и
  без неё, популярность, игры) и сравнивает с `INDEX_MIN_OWN_FACTS`. Её читают
  meta robots карточки `/library/<kind>/<slug>-<id>/` и сегмент существ карты
  сайта (на тех же данных проекции и статистики). Страница ниже порога —
  `noindex, follow`, без JSON-LD и вне карты. Сегмента заклинаний нет: страница
  заклинания несёт 4–6 фактов, ни одна не набирает десять (пустой сегмент
  недопустим, загрузчик не регистрируется). Подробности:
  `docs/specs/battleground-library-open-layer.md`.
- Статические страницы без открытого слоя (E25 #538, замер прода
  2026-11-20): `/standard/vicious-gold/`, `/battlegrounds/tier-builder/`,
  `/contests/`, `/library/archive/` и `/library/archive/<kind>/` отдают гостю
  только «Проверяем доступ…» или пустой список, 0–28 собственных слов. Они —
  `noindex, follow`, `canonicalPolicy: none`, без JSON-LD реестра, без
  `og:url` и вне `static.xml` (#553). `/contests/` и `/standard/vicious-gold/`
  идут через `seoRegistryMetadata`, который у страниц вне карты сайта не
  отдаёт `og:*`/`twitter:*`, так что их превью в мессенджерах — без картинки
  (принято: страницы не индексируются). Крошки JSON-LD деталей архива
  по-прежнему ведут на noindex-списки архива — допустимо до решения по
  деталям архива. Вернуть `index` можно только вместе с открытым слоем,
  который проходит порог выше.

## Canonical карт двух форматов (#307)

Карта, легальная в Стандарте, имеет одну индексируемую страницу —
`/standard/cards/standard/<id>/`. Её Вольная копия
`/standard/cards/wild/<id>/` остаётся доступной (200, `index, follow`), но
canonical, `og:url` и `@id` JSON-LD ведут на страницу Стандарта: тексты карт
совпадают, а статистика по форматам платная и в HTML не попадает. Легальность
в Стандарте страница узнаёт у Express (`isStandardCard` в
`apps/public-web/lib/publicCard.ts`: 200/404 открытой проекции Стандарта,
при сбое — последняя удачная копия); если ответа нет, Вольная страница
оставляет canonical на себя, а не угадывает. Карта только Вольного формата —
self-canonical. В `wild-cards.xml` копий карт Стандарта нет
(`excludeStandardCardsFromWildCatalog`).

## IndexNow (E25, #304)

Сегмент карты сайта, пересобранный из источника с изменившимся списком,
вызывает `onSegmentPublished(segment, previous, next)` роутера
(`server/entitySitemapRoutes.ts` → `entitySitemapDynamicLoader.ts`).
`changedSitemapLocations` из `server/indexNow.ts` отдаёт новые, изменённые
(другой `semanticHash` или адрес) и ушедшие адреса; без предыдущего состояния —
пустой список. Запасная копия и устаревший источник хук не вызывают; ошибка
хука или IndexNow не меняет ответ карты сайта. Порядок работы и выключение —
`docs/runbooks/search-consoles.md#indexnow-304`.

## Documentation impact

- This specification records the new sitemap segment and page-quality contract.
- `docs/roadmaps/SEO-STRATEGY.md` marks the hero/Battlegrounds/Wild sitemap
  slice complete and records the remaining article/additional-entity scope.
- `CHANGELOG.md` records the user-visible release.
- No ADR is required: the implementation extends the already accepted
  canonical and semantic-LKG architecture without changing its decision.
