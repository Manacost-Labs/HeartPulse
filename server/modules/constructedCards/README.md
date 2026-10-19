# Constructed cards server module

## Catalog readers

`createConstructedCardCatalogReaders` isolates anonymous identity reads from
full statistics reads while sharing injected source catalogs and invalidation.
Public rows contain no statistics, do not trigger statistics requests or history
writes, and use catalog publication time. Full rows retain statistics validation,
warning fallback, period/rank metadata and history recording. Legacy callers
without `loadPublicCards` retain the old full-reader fallback through
`constructedCatalogReaderForAccess`.
