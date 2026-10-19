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
