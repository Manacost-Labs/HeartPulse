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
  date.

## Page contract

Each included detail page must return:

- HTTP 200 with `index, follow` for a verified entity;
- one self-canonical URL and matching Open Graph URL;
- a unique title, description and H1 derived from public entity data;
- server-rendered visible facts and an entity image;
- JSON-LD containing `WebPage`, the described `CreativeWork`, and a
  `BreadcrumbList` matching visible navigation;
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
  by `apps/public-web/lib/publicArchetypeRoute.ts`.
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
  minion, Battlegrounds spell and Battlegrounds hero segments.
- Every URL in each entity segment is unique, canonical, parameter-free and
  within protocol limits.
- Entity SSR pages use HearthPulse branding, expose aligned `WebPage`, entity
  and breadcrumb schema, and link to relevant libraries and tier lists.
- Tier-list and library hubs retain unique intent-aligned metadata and explain
  how to reach detail pages.
- Focused tests, full project gates, browser review and production smoke pass.

## Documentation impact

- This specification records the new sitemap segment and page-quality contract.
- `docs/roadmaps/SEO-STRATEGY.md` marks the hero/Battlegrounds/Wild sitemap
  slice complete and records the remaining article/additional-entity scope.
- `CHANGELOG.md` records the user-visible release.
- No ADR is required: the implementation extends the already accepted
  canonical and semantic-LKG architecture without changing its decision.
