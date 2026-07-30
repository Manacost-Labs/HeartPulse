# Public API v1: meta and archetype statistics

## Objective

Expose the normalized constructed metagame and archetype aggregates required
by a Hearthstone tracker without returning provider URLs, scraper payloads or
user-level observations.

The release adds:

- a paginated Standard or Wild meta snapshot;
- current aggregate statistics for one archetype;
- a bounded historical series for one archetype;
- Legend/7-day class-matchup and card-impact analysis when available.

All resources require `statistics.read` through an API key or application
bearer token.

## Meta snapshot

`GET /api/v1/meta-statistics`

Query dimensions:

- `format=standard|wild`, default `standard`;
- `rank=all|diamond|diamond_4_1|diamond_to_legend|legend|top_5000|top_1000|top_500|top_100`;
- `period=1d|3d|7d|14d|patch`;
- `minGames=100|250|500|1000|2500|5000`;
- `limit`, default `100`, maximum `500`;
- opaque, dataset-version-bound `cursor`.

Items are sorted by popularity, then sample size and stable slug. A cursor is
bound to format, rank, period, minimum sample and dataset version. A changed
snapshot therefore produces a validation error instead of silently skipping
or duplicating an archetype.

Each item includes stable identity, localization and these nullable metrics:

<!-- markdownlint-disable MD013 -->

| Field | Unit | Meaning |
| --- | --- | --- |
| `winratePercent` | percentage points | Archetype win rate |
| `popularityPercent` | percentage points | Share of observed games |
| `games` | games | Observed sample size |
| `averageTurns` | turns | Mean turns per game |
| `averageDurationMinutes` | minutes | Mean game duration |
| `climbingSpeedStarsPerHour` | ladder stars/hour | Estimated climb speed |

<!-- markdownlint-enable MD013 -->

Every item also exposes first-party `links` for the canonical archetype page,
current statistics, history, analysis and the filtered collection of concrete
builds. These URLs include the selected Standard or Wild format.

The external rank and period names are stable API identifiers. They are mapped
to the current authoritative source identifiers inside the adapter. For
`period=patch`, the adapter first resolves the source's declared current patch
and never guesses a patch from the calendar or scrape time.

## Archetype resources

`GET /api/v1/archetypes/{slug}/statistics`

Returns the current patch aggregate plus `deckCount` and the same canonical
link relations. Concrete builds are available from `links.builds`.

`GET /api/v1/archetypes/{slug}/statistics/history`

Accepts `days=7..365`, default `90`. Points are chronological and capped at
1,000. The window is anchored to the newest authoritative point so a delayed
source does not turn a valid historical series into an empty response.

`GET /api/v1/archetypes/{slug}/analysis`

Returns the currently available Legend/7-day aggregate analysis:

- class matchup win rate, sample count and share;
- per-card mulligan, drawn and kept impact in percentage points;
- the corresponding sample counts.

The response states the rank and period explicitly. Missing analyses return a
stable `404 ARCHETYPE_ANALYSIS_NOT_FOUND`.

## Privacy and source boundaries

Every response is built by an explicit allowlist serializer. The following
never cross the public API boundary:

- provider and scraper URLs;
- raw source identity and translation provenance;
- internal coverage/debug payloads;
- raw build source records;
- provider-specific fields added in future payload versions.

Invalid input returns `400 INVALID_META_STATISTICS_QUERY`. An unavailable
authoritative source and missing last-known-good data return
`503 META_STATISTICS_UNAVAILABLE` with `Retry-After: 60`; internal exception
messages are never returned.

## Caching and observability

Successful responses use private authenticated caching, `ETag`,
`X-Dataset-Version` and `X-Data-Cache`, and honor `If-None-Match`. Stale
responses carry HTTP warning `110`.

The meta adapter serializes a complete snapshot once per dataset version.
Detail, history and analysis perform a bounded number of source reads and
never issue one request per archetype or card. Existing HTTP RED metrics
record route templates, status and latency without credentials, slugs, cursor
values or filters as labels.

## Verification

- Contract tests start red before routes exist.
- Authentication is verified before any source load.
- Cursor, rank, period, sample and history bounds are covered.
- Contract assertions cover canonical links for both formats.
- Redaction assertions prove provider URLs and raw fields do not cross the
  boundary.
- OpenAPI 3.1 documents units, nullable fields, enums, errors and scopes.
- Type checking, architecture budgets, security scans, release gates and
  production smoke checks run before the task is closed.
