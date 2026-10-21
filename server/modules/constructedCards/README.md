# Constructed cards server module

## Catalog readers

`createConstructedCardCatalogReaders` isolates anonymous identity reads from
full statistics reads while sharing injected source catalogs and invalidation.
Public rows contain no statistics, do not trigger statistics requests or history
writes, and use catalog publication time. Full rows retain statistics validation,
warning fallback, period/rank metadata and history recording. Legacy callers
without `loadPublicCards` retain the old full-reader fallback through
`constructedCatalogReaderForAccess`.

A warm anonymous result is reused during one background source refresh for up
to three result TTLs after expiry, capped at 15 minutes. It is marked `stale` /
`LKG` and retains its publication and verification times. A failed warm refresh
has a 30-second cooldown; neither failure nor serving the old result resets its
expiry. Invalidation generations protect both the cache and cooldown from late
jobs. A refreshed catalog replaces the old membership, and the public card reader
still rejects a missing identity in a stale snapshot instead of returning 404.
Cold reads and full-statistics reads keep their existing awaited behavior.

## History context

`createCardHistoryContextReader` adds what a card's history chart cannot derive
from its own points: the first snapshot of the card in the slice
(`ConstructedCardHistoryStore.trackedSince`) and play-weighted average winrates
of sampled cards of its class and of the whole format
(`ConstructedCardHistoryStore.readAverages`). The format average reads the whole
slice synchronously (about 0.1 s on production data), so averages are cached per
slice, class, range start and collection update. Callers expose it only to
readers with statistics access.
