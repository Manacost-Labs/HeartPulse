# Boosty + Tribute / Koloda article analytics

## Objective

Add an admin-only analytics workspace to Arena that compares Boosty and Tribute
subscription activity with publication intervals from KolodaHearthstone. The
workspace shows new paid subscriptions, renewals, net RUB receipts, plan
distribution, source breakdown, and retention for new-subscriber cohorts.

## Current limitation

The existing Boosty monitor stores only the latest JSON snapshot. Exact historic
renewals and payment deltas cannot be reconstructed from that file. The first successful
run of the new journal is therefore a baseline and creates no synthetic payment
events. Exact analytics begin with the next successful observation.

Tribute is event-driven and has no historical backfill in the documented API.
Its exact analytics therefore begin with the first successfully signed webhook.

## Components

### Boosty collector (`/home/debian/boosty-auth`)

- Add an append-only SQLite journal at `data/boosty_analytics.sqlite3`.
- Record every accepted monitor poll.
- Keep the current subscriber state and append a state version only when a
  subscriber changes. The version contains the raw observed Boosty record so an
  administrator can later audit who, how much, when, and on which plan.
- Treat `payments` as an observed cumulative balance, not a transaction feed.
  Parse it with `Decimal` into integer kopecks and never replace missing/invalid
  values with zero.
- Infer payment observations only from comparable explicit-RUB balances:
  - a first-ever appearance after baseline is `new_subscription` only when
    Boosty's `onTime` is after the previous accepted poll and the observed
    balance is positive; older first-seen balances become baseline state;
  - a positive delta for an already known subscriber is `observed_renewal`;
    it counts an observed increase, not guaranteed upstream transactions;
  - a negative delta is `observed_decrease`, excluded from revenue and shown
    separately rather than labelled a refund.
- Save the plan name, plan ID, currency, gross plan price, and observed net
  payment delta at event time.
- Baseline is idempotent. Failed or quarantined imports must not change the
  journal. Missing subscribers in an accepted full poll receive tombstones.
- SQLite is the canonical comparison state. Writes use `BEGIN IMMEDIATE`, bound
  parameters, WAL, a busy timeout, and owner-only directory/database/sidecar
  permissions. JSON snapshots are compatibility projections written only after
  the journal commit.
- Expose a localhost aggregate endpoint. It returns no email, display name, raw
  subscriber row, or credentials.
- Run one monitor as a separate Compose service so collection continues without
  the Telegram bot. Other processes may ingest through the same transactional
  store, but may not run a competing background loop.

### Tribute webhook collector (`/home/debian/boosty-auth`)

- Accept `POST /api/tribute/webhook` and verify `trbt-signature` as HMAC-SHA256
  over the untouched request body using `TRIBUTE_API_KEY`.
- Limit request bodies to 256 KiB and reject missing/invalid signatures before
  parsing or writing.
- Record `new_subscription`, `renewed_subscription`, and
  `cancelled_subscription`; acknowledge unrelated valid Tribute events without
  adding them to subscription analytics.
- Deduplicate retries by a stable event fingerprint that excludes `sent_at`.
- Store no raw webhook or direct subscriber identifier. `trb_user_id` is
  pseudonymized with a separate stable `TRIBUTE_IDENTITY_KEY`, so API-key
  rotation does not break cohorts.
- Treat `amount` as the net amount after commission in minor currency units.
  Only explicit RUB values enter `revenueRub`; other currencies are reported as
  unsupported rather than silently converted.
- Persist events and current subscription state in
  `data/tribute_events.sqlite3` with owner-only permissions.
- Expose a PII-free aggregate at `GET /api/tribute/analytics`.

### Arena server (`/home/debian/manacost-arena`)

- Add an admin-authenticated route under `/api/admin/boosty/analytics`.
- Validate and bound `from` / `to` to a maximum 366-day range.
- Fetch Boosty and Tribute aggregate analytics independently from the
  configured localhost service. If one source is unavailable, return the other
  with partial coverage instead of fabricated zeros.
- Fetch published articles from
  `https://kolodahearthstone.ru/wp-json/koloda/v1/articles/query`.
- Validate both remote payloads and use request timeouts.
- Build half-open publication intervals:
  `[article.publishedAt, nextArticle.publishedAt)`, with the latest interval
  ending at the selected `to` value.
- Aggregate Boosty observations and exact Tribute subscription events into
  every interval. This is temporal correlation, not causal attribution.
- Return private, non-cacheable JSON. No subscriber PII is sent to the browser.

### Arena admin UI

- Add an `Аналитика` item to the existing admin workspace navigation.
- Provide date filters and a manual reload action.
- Show combined totals plus separate Boosty and Tribute cards for new
  subscriptions, renewals, net RUB receipts, D30 retention, and data semantics.
- Show D7 / D30 / D60 / D90 retention for mature new-subscriber cohorts.
- Show plan distribution and a responsive article-interval table.
- Clearly label baseline/data-coverage limitations and source freshness.
- Add a Storybook story with populated, loading, and empty/error states.

## Retention definition

The cohort contains subscribers whose first qualified positive observation is
`new_subscription`. For each member and day N, `dueAt = cohortAt + N days`.
Evaluation uses the first accepted full poll at or after `dueAt`, with a maximum
24-hour lag. The state effective at that poll is retained when it is present,
active, and paid. Missing evaluation polls are `unknown` and never count as
churn. The API returns `eligible`, `evaluated`, `retained`, `unknown`, and
`retained / evaluated × 100`. Later state changes do not rewrite the milestone.

For Tribute, a cohort starts at `new_subscription`. A milestone is retained
when a signed event observed by `dueAt + 24h` proves that `expires_at` reaches
the milestone. Cancellation of auto-renewal does not count as churn before the
paid access expiration.

## Tests

- Python unit tests for Boosty baseline/inference and Tribute signature,
  deduplication, PII exclusion, currency handling, aggregate grouping, and
  retention maturity.
- Express route tests for admin authorization, date bounds, upstream failures,
  payload validation, and interval attribution.
- React/model tests for formatting and empty/partial states.
- Storybook contract/build, TypeScript lint, changed-file React checks,
  Semgrep, server build, and a real-browser admin review.

## Boundaries and failure behavior

- Existing JSON snapshot/event log remain as backward-compatible projections;
  SQLite is authoritative.
- A journal write failure prevents replacing the JSON snapshot, so the next poll
  can retry without losing a payment delta.
- Arena marks one missing subscription source as partial and fails only when
  both subscription sources are unavailable.
- The Arena UI remains isolated on its feature branch. The Tribute webhook
  backend and exact nginx route were deployed separately so events can be
  collected before the UI branch is merged.
- Sampling can miss a payment followed by a refund between polls and can combine
  multiple payments into one observed increase. Exact transaction counts require
  a transaction-level Boosty API or webhook.
- Tribute retries failed webhook delivery for approximately 24 hours according
  to its documentation. Events before webhook configuration cannot be
  reconstructed by this integration.
