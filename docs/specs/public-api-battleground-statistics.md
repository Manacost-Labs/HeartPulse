# Public API v1: Battlegrounds statistics

## Objective

Expose current Battlegrounds hero, minion and statistical tier-list data while
keeping scraper state, upstream URLs, media, raw snapshot identifiers and
strategy card lists behind the server boundary.

All resources require `statistics.read` through an API key or application
bearer token.

## Resources

`GET /api/v1/battlegrounds/statistics/heroes`

Supports `tier`, `minPickRate`, `limit` and an opaque cursor. Items contain
the stable hero DBF identity, tier, best-composition identity when available,
pick rate, average placement and up to eight placement-distribution values.
The response metadata declares the MMR percentile and time range.

`GET /api/v1/battlegrounds/statistics/minions`

Supports `tavernTier`, `minGames`, `limit` and `cursor`. Metrics include
impact, combat win rate, popularity, games with and without the minion, and
average placement with and without it.

`GET /api/v1/battlegrounds/statistics/tier-lists/{kind}`

`kind` is one of `heroes`, `minions`, `spells`, `trinkets` or `strategies`.
The common statistical projection includes stable identity, localization,
tier and available placement, game-count, impact, popularity, pick, combat
win-rate and first-place metrics. Provider-specific absent fields are `null`.

## Source and security boundary

The production adapter calls only three fixed paths on the loopback
Battlegrounds service. Neither request parameters nor source data can change
the origin or path, so this integration does not create a user-controlled SSRF
surface.

Explicit allowlist serializers remove:

- source, scraper and cache status payloads;
- upstream and media URLs;
- raw run and snapshot ids;
- card lists and descriptions attached to strategies;
- unknown provider fields introduced by later source revisions.

Invalid input returns `400 INVALID_BATTLEGROUNDS_STATISTICS_QUERY`. Source
failure returns `503 BATTLEGROUNDS_STATISTICS_UNAVAILABLE` with
`Retry-After: 60`; internal exception text is not returned.

## Caching and verification

Responses are cursor-bounded to 500 rows, carry `ETag`,
`X-Dataset-Version` and `X-Data-Cache`, and honor `If-None-Match`. Snapshots
older than 48 hours are marked stale with HTTP warning `110`.

Contract tests cover authorization-before-load, filters, pagination,
redaction, nullable metrics and all supported tier-list kinds. OpenAPI 3.1
documents units, bounds and response schemas.
