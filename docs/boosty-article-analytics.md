# Boosty / Koloda article analytics

## Objective

Add an admin-only analytics workspace to Arena that compares Boosty payment
activity with publication intervals from KolodaHearthstone. The workspace must
show inferred new paid subscriptions, observed renewals, observed cumulative
payment increases in RUB, plan distribution, and retention for new-subscriber
cohorts.

## Current limitation

The existing Boosty monitor stores only the latest JSON snapshot. Exact historic
renewals and payment deltas cannot be reconstructed from that file. The first successful
run of the new journal is therefore a baseline and creates no synthetic payment
events. Exact analytics begin with the next successful observation.

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

### Arena server (`/home/debian/manacost-arena`)

- Add an admin-authenticated route under `/api/admin/boosty/analytics`.
- Validate and bound `from` / `to` to a maximum 366-day range.
- Fetch Boosty aggregate analytics from the configured localhost service.
- Fetch published articles from
  `https://kolodahearthstone.ru/wp-json/koloda/v1/articles/query`.
- Validate both remote payloads and use request timeouts.
- Build half-open publication intervals:
  `[article.publishedAt, nextArticle.publishedAt)`, with the latest interval
  ending at the selected `to` value.
- Aggregate inferred new subscriptions, observed increases/decreases, and plans
  into every interval. This is temporal correlation, not causal attribution.
- Return private, non-cacheable JSON. No subscriber PII is sent to the browser.

### Arena admin UI

- Add an `Аналитика` item to the existing admin workspace navigation.
- Provide date filters and a manual reload action.
- Show totals for inferred new subscriptions, observed renewals, observed RUB
  increases, and current data coverage.
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

## Tests

- Python unit tests for baseline behavior, new/increase/decrease inference,
  idempotence, state history, aggregate grouping, and retention maturity.
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
- Arena degrades article analytics with an explicit private error response; it
  never substitutes fabricated zeros for an unavailable source.
- No deployment is part of this implementation unless separately requested.
- Sampling can miss a payment followed by a refund between polls and can combine
  multiple payments into one observed increase. Exact transaction counts require
  a transaction-level Boosty API or webhook.
