# Public API v1: Arena statistics

## Objective

Expose the current Arena class, card, legendary-card and class-matchup
aggregates required by a tracker without forwarding provider URLs, raw scrape
payloads or presentation-only media fields.

All resources require `statistics.read` through an API key or application
bearer token.

## Resources

`GET /api/v1/arena/statistics/classes`

Returns class rank, normalized class id, localized name, win rate in percentage
points and observed games. `source=hsreplay|firestone` selects the
authoritative aggregate.

`GET /api/v1/arena/statistics/cards`

Supports `source`, `class`, `tier`, `minGames`, `limit` and an opaque
dataset-version-bound `cursor`. The nullable metrics cover deck, played,
drawn and mulligan win rates, pick, inclusion, offer, discard and kept rates,
sample size, Arena score and average copies.

`GET /api/v1/arena/statistics/legendaries`

Supports `source`, `class`, `minGames`, `limit` and `cursor`. Every item
contains the stable key-card id, normalized aggregates and stable ids of the
related package cards. It never embeds raw provider card records.

`GET /api/v1/arena/statistics/matchups`

Returns directed class-A versus class-B win rates. An optional `class` filter
keeps rows where the class appears on either side.

## Contract and boundaries

- Percentage values are percentage points in the closed `0..100` interval.
- Missing source metrics are returned as `null`, never guessed.
- Known class and tier enums are validated at the HTTP boundary.
- List responses are capped at 500 rows and cursors bind filters to a dataset
  version, preventing traversal across incompatible refreshes.
- Provider names, URLs, raw images, CSS fields and unknown source keys are
  removed by explicit allowlist serializers.

Invalid input returns `400 INVALID_ARENA_STATISTICS_QUERY`. Source failure
returns `503 ARENA_STATISTICS_UNAVAILABLE` with `Retry-After: 60`; internal
exception text is not returned.

## Caching and verification

Successful responses carry `ETag`, `X-Dataset-Version` and `X-Data-Cache`,
honor `If-None-Match`, and use authenticated private caching. Data older than
48 hours is marked stale and receives HTTP warning `110`.

Contract tests cover authorization-before-load, every filter, pagination,
redaction, nullable metrics and stable error bodies. OpenAPI 3.1 documents
units, bounds and response schemas.
