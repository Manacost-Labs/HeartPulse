# Constructed archetype catalog cache

`public.ts` exports the per-format cache and upstream document guard. Callers
inject the normalized catalog reader and its existing freshness TTL. This
module owns bounded stale reads, concurrent refresh coalescing, refresh retry
cooldowns, source deadlines and generation-safe invalidation.

Entries are keyed by format and HSGuru period.
`loadArchetypeCatalogForPeriod` (`server/constructedArchetypeCatalogPeriod.ts`,
beside the routes, since it reads the shared period contract) picks the
catalog the archetype pages open on: the requested period, else the current
Bans window when the source lists it in `meta.available_periods`, else the
source default
([periods spec](../../../docs/specs/standard-meta-periods.md)). Other readers
(public API, deck statistics, patch notes) keep the source default.

The legacy source normalization remains in `server/index.ts`. The route owns
authorization and public projections; neither viewer state nor session data
enters this cache. History and analysis caches are unchanged.

The request that first reads an expired but usable snapshot starts one refresh
in the background. There is no scheduled job or persistent snapshot storage.
See [the operating contract](../../../docs/runbooks/constructed-archetypes-performance.md).

Verification: `node --import=tsx --test tests/constructed-archetype-catalog-cache.test.ts
tests/constructed-archetype-catalog-period.test.ts` and `node --import=tsx tests/constructed-archetype-routes.test.ts`.

`createMetaSliceCache` applies the same policy to the Standard meta slices
(`/api/standard-meta`, its teaser and the public meta API), keyed by format,
rank, period, coin and minimum games. Composition passes the legacy reader;
the cache hands it the last good slice for the continuity check and keeps that
slice when a read fails or is rejected. Verification:
`npm run test:standard-meta-cache`.

The detail handler serves compatible `core`, `history`, `analysis` and default
full projections through injected readers. Mount it after access/private
response guards. It never starts optional reads for `core` and surfaces optional
section failures without changing the legacy full response contract.

`createArchetypeRankMatrixLoader` builds the `ranks` detail section: one
archetype's winrate and games in every rank × period slice of the HSGuru meta
matrix (five ranks of the site's meta filters, five rolling windows, the
current expansion window and its Bans window), plus the Bans window going
first and on coin (`coins`). Composition injects the cached Standard meta slice
reader, so the section adds no upstream requests beyond those slices. A failed
or archetype-less slice is an empty cell; a matrix with no readable slice
fails the section with 502.

`archetypeLabel` is the only place that gives an HSGuru archetype name its
Russian label, for the meta, matchups, archetype pages, card pages and the deck
builder: the exact translation, otherwise the longest translated name inside it
with the remaining words in brackets, so HSGuru's variants ("Harold Piglock"
next to "Piglock") never borrow one bare label. `matchArchetypeTranslation` is
the same matcher for callers that need the matched key (admin coverage).
`disambiguateArchetypeLabels` keeps the labels of one list distinct when the
translation data itself gives two archetypes one name: all but the
shortest-named archetype add the English name in brackets.

Translations are the admin table `archetype_translations` layered over
`archetypeFallbackTranslations()` (`fallbackTranslations.ts`, the only built-in
dictionary; the client renders the server's labels). The admin list reports
`findDuplicateArchetypeLabels` and refuses a manual Russian name that another
archetype already has. Verification: `npx tsx tests/standard-archetype-label.test.ts`
and `npx tsx tests/archetype-label-golden.test.ts`.

`createHsguruStatsReader` (`hsguruStats.ts`) reads one archetype's HSGuru
mulligan, class matchups, stored slices and pipeline coverage from
hs-data-api `/v1/hsguru/mulligan*` and `/v1/hsguru/class-matchups`; a slice
the source has not collected (404 there) is `null` and is cached like data.
`createArchetypeHsguruStatsHandler` serves it as
`/api/constructed-archetype-stats/:format/:slug`; composition
(`server/constructedArchetypeHsguruStats.ts`) adds the entitlement guard,
Russian card names and card media
([contract](../../../docs/specs/archetype-hsguru-stats.md)). Verification:
`node --import=tsx --test tests/archetype-hsguru-stats.test.ts`.
