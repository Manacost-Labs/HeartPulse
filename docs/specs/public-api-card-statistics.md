# Public API v1: card statistics

## Objective

Expose the complete aggregated constructed-card statistics needed by a
Hearthstone tracker without exposing provider records, paid-source payloads or
user-level data.

The release provides:

- one paginated snapshot for bulk synchronization;
- one current-statistics resource for a card;
- one bounded historical series for a card;
- Standard and Wild formats;
- Legend, Diamond 1–4, Diamond and Platinum ranks;
- one-, three-, seven- and fourteen-day periods plus the current patch.

Archetype and metagame resources are specified separately in
`docs/specs/public-api-meta-statistics.md`. Deck, Arena and Battlegrounds
resources use the same authentication, freshness, error and pagination
conventions and have dedicated specifications in this directory.

## Authorization

All statistics resources require `statistics.read` through either:

- `X-API-Key` for server integrations; or
- an OAuth application bearer token.

`statistics.read` is independent from `catalog.read` and `images.read`, so a
credential can receive only the data it needs. The registered Manacost Tracker
client may request the new scope. The browser approval screen names it
explicitly.

Authentication and scope checks run before dataset loading. Failed
authentication responses are not cacheable.

## Resources

### Bulk snapshot

`GET /api/v1/card-statistics`

Query:

- `format=standard|wild`, default `standard`;
- `rank=legend|diamond_4_1|diamond|platinum`, default `legend`;
- `period=1d|3d|7d|14d|patch`, default `1d`;
- `limit`, default `120`, maximum `500`;
- opaque `cursor`.

Cards are ordered by stable Hearthstone card ID. Every catalog card is present,
including cards whose metrics are all `null`. This lets a tracker distinguish
"card exists but no reliable sample" from "card missing from the catalog".

The cursor binds the format, rank and period. Reusing it with another slice is
rejected rather than silently skipping records.

### Current card statistics

`GET /api/v1/cards/{cardId}/statistics`

The resource accepts the same format, rank and period dimensions. It returns
`404 CARD_STATISTICS_NOT_FOUND` when the card is not in the selected catalog.
A known card with no reliable sample returns `200` and nullable metrics.

### Card statistics history

`GET /api/v1/cards/{cardId}/statistics/history`

The resource accepts the same dimensions and `days=7..365`, default `90`.
Points are ordered by `recordedAt` ascending and bounded by the history-store
limit of 1,000 points.

## Stable data model

Each statistics item contains:

- `cardId`;
- `metrics`;
- no translated card fields and no upstream payload.

Metric names and units are:

<!-- markdownlint-disable MD013 -->

| Field | Unit | Meaning |
| --- | --- | --- |
| `deckPopularityPercent` | percentage points | Share of decks containing the card |
| `deckWinratePercent` | percentage points | Win rate of decks containing the card |
| `averageCopies` | cards per deck | Mean number of copies |
| `timesPlayed` | games | Observed plays/sample count |
| `winrateWhenPlayedPercent` | percentage points | Win rate when the card was played |
| `winrateWhenDrawnPercent` | percentage points | Win rate when the card was drawn |
| `keepPercentage` | percentage points | Mulligan keep rate |
| `openingHandWinratePercent` | percentage points | Win rate when in the opening hand |
| `averageTurnsInHand` | turns | Mean turns held before play |
| `averageTurnPlayed` | turn number | Mean turn on which the card was played |

<!-- markdownlint-enable MD013 -->

All metrics are nullable. Rates below the site's minimum reliable sample remain
`null`; the API never reconstructs or presents suppressed percentages.
`timesPlayed` stays visible when available so clients can explain the missing
rate.

Every response includes metadata:

- selected `format`, `rank` and `period`;
- human-independent upstream rank range and period time range when available;
- `updatedAt`;
- `datasetVersion`;
- `dataStatus=fresh|stale`.

Provider URLs, scraper diagnostics, cache paths, raw HSReplay fields and source
payloads are deliberately omitted.

## Caching and failure behavior

Successful responses use authenticated private caching, include `ETag`,
`X-Dataset-Version` and `X-Data-Cache`, and honor `If-None-Match`.
Last-known-good data is explicitly marked stale with HTTP warning `110`.

Invalid scalar queries return:

```json
{
  "error": {
    "code": "INVALID_CARD_STATISTICS_QUERY",
    "message": "Card statistics query is invalid"
  }
}
```

Unavailable authoritative and last-known-good data returns a safe
`503 CARD_STATISTICS_UNAVAILABLE` with `Retry-After: 60`. Internal errors never
cross the API boundary.

## Performance and observability

- A bulk page loads one constructed-card collection and serializes it once.
- Serialized snapshots are reused while `datasetVersion`, format, rank and
  period are unchanged.
- No route performs one upstream request per card.
- Existing HTTP RED metrics observe the route template, status and latency.
- Credentials, card IDs, cursors and query values are not metric labels.

## Verification

- Tests begin red for scope isolation, bulk pagination, cursor binding,
  current-card lookup, history bounds and safe failures.
- Serializer tests prove that private provider fields cannot cross the
  boundary.
- OpenAPI 3.1 documents every query, enum, nullable metric and error.
- Developer docs show the bulk synchronization request and endpoint list.
- Type checking, architecture lint, Semgrep, Gitleaks, release verification,
  production health checks and browser verification must pass before the
  Notion task is closed.

## Rollback

The change adds routes and one scope without a storage migration. Rolling back
the release removes the resources; existing API keys containing an unknown
scope remain hashed records and cannot grant access on the older application
version.
