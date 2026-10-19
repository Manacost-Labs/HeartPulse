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

The detail handler serves compatible `core`, `history`, `analysis` and default
full projections through injected readers. Mount it after access/private
response guards. It never starts optional reads for `core` and surfaces optional
section failures without changing the legacy full response contract.
