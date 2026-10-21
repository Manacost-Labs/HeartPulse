# Constructed archetype catalog cache

`public.ts` exports the per-format cache and upstream document guard. Callers
inject the normalized catalog reader and its existing freshness TTL. This
module owns bounded stale reads, concurrent refresh coalescing, refresh retry
cooldowns, source deadlines and generation-safe invalidation.

The legacy source normalization remains in `server/index.ts`. The route owns
authorization and public projections; neither viewer state nor session data
enters this cache. History and analysis caches are unchanged.

The request that first reads an expired but usable snapshot starts one refresh
in the background. There is no scheduled job or persistent snapshot storage.
See [the operating contract](../../../docs/runbooks/constructed-archetypes-performance.md).

Verification: `node --import=tsx --test tests/constructed-archetype-catalog-cache.test.ts`
and `node --import=tsx tests/constructed-archetype-routes.test.ts`.

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
matrix (five ranks of the site's meta filters, five rolling windows and the
current expansion window). Composition injects the cached Standard meta slice
reader, so the section adds no upstream requests beyond those slices. A failed
or archetype-less slice is an empty cell; a matrix with no readable slice
fails the section with 502.
