# Public API v1: concrete deck statistics

## Objective

Expose current aggregate performance and portable deck definitions for
concrete Standard and Wild builds while keeping provider URLs and raw payloads
behind the server boundary.

Both resources require `statistics.read` through an API key or application
bearer token.

## Build list

`GET /api/v1/deck-statistics`

Query dimensions:

- `format=standard|wild`, default `standard`;
- optional `archetype` using the public archetype slug;
- `minGames=0..10000000`, default `0`;
- `limit`, default `100`, maximum `500`;
- opaque, dataset-version-bound `cursor`.

Builds are sorted by observed games, win rate and stable public identifier.
The cursor is bound to format, archetype filter, minimum sample and dataset
version. A changed source snapshot therefore cannot silently skip or duplicate
builds during traversal.

Each item contains:

<!-- markdownlint-disable MD013 -->

| Field | Unit | Meaning |
| --- | --- | --- |
| `deckId` | stable opaque id | SHA-256-derived public identity |
| `deckCode` | Hearthstone deck code | Portable definition of the complete build |
| `metrics.games` | games | Observed sample size |
| `metrics.winratePercent` | percentage points | Aggregate build win rate |
| `sample.rank` | source-defined id | Rank represented by this aggregate |
| `sample.period` | source-defined id | Time window represented by this aggregate |
| `updatedAt` | ISO 8601 | Build-level source update time when available |
| `links.statistics` | absolute URL | API resource for the exact build |
| `links.builder` | absolute URL | First-party constructor with the build loaded |
| `links.archetype` | absolute URL | Canonical page of the parent archetype |
| `links.archetypeBuilds` | absolute URL | Filtered build collection for the archetype |

<!-- markdownlint-enable MD013 -->

The nested archetype object contains only its public slug, English and
localized names, and class identifier.

## Build detail

`GET /api/v1/decks/{deckId}/statistics`

Returns the same normalized item for one public build identifier in the
selected format. Unknown identifiers return
`404 DECK_STATISTICS_NOT_FOUND`.

The identifier is deterministic for a normalized deck code, so it remains
stable while the exact build remains unchanged. The `deckCode` can be decoded
by a tracker or passed directly to `links.builder`.

## Privacy and source boundaries

An explicit allowlist serializer drops:

- provider and scraper URLs;
- internal coverage, source and translation fields;
- any provider-specific fields added in future payload revisions.

Only first-party links built from the configured application origin are
returned. Upstream URL fields are never copied into the response.

Duplicate source rows for the same build are collapsed by public identifier;
the row with the strongest game sample wins.

Invalid input returns `400 INVALID_DECK_STATISTICS_QUERY`. If the authoritative
catalog is unavailable and no last-known-good view exists, the API returns
`503 DECK_STATISTICS_UNAVAILABLE` with `Retry-After: 60`. Internal exceptions
are never returned.

## Caching and observability

Successful responses use authenticated private caching, `ETag`,
`X-Dataset-Version` and `X-Data-Cache`, and honor `If-None-Match`. Stale
responses carry HTTP warning `110`.

The complete catalog is serialized once per source update and reused by list
and detail reads. Existing HTTP RED metrics record route templates, status and
latency without credentials, build identifiers or filters as labels.

## Verification

- Contract tests start red before the routes exist.
- Authentication is verified before the source is loaded.
- Format, archetype, sample, limit, cursor and identifier bounds are covered.
- Contract assertions cover portable deck codes and all first-party link
  relations.
- Redaction assertions prove provider URLs and unknown fields do not cross the
  boundary.
- OpenAPI 3.1 documents units, nullable fields, errors and scope.
- Type checking, architecture budgets, security scans, release gates and
  production smoke checks run before closure.
