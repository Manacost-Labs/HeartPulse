# Spec: Arena draft refresh pipeline v1

## Objective

Keep the Arena draft advisor current as new 12-win decks arrive without
allowing malformed, stale or statistically unsafe data to replace the last
known-good model.

The pipeline recalculates deterministic cohort statistics. It does not tune the
advisor weights automatically because the current source has no losing runs,
complete draft offers or pick outcomes suitable for supervised evaluation.

## Stack

- Node.js 22 runtime and TypeScript 5.8.
- Express 4.21 administrator routes.
- `node-cron` 4.5 for the in-process UTC schedule with overlap prevention.
- Existing Arena analysis, data-quality checks, cohort history and durable JSON
  writer.
- No new runtime dependency, secret, database table or source provider.

## Commands

- Focused tests: `npm run test:arena-synergies && npm run test:metrics`
- Typecheck: `npm run lint`
- Security scan: `npm run security:semgrep:strict`
- Production build: `npm run build`
- Release gate: `npm run verify:release`

## Pipeline contract

The production service schedules `17 * * * *` in UTC by default and starts one
delayed warm-up refresh after process startup. Operators can override the cron
expression with `ARENA_DRAFT_REFRESH_CRON` or disable automatic execution with
`ARENA_DRAFT_REFRESH_ENABLED=0`.

Each run:

1. fetches the winning-deck, advanced-card and Arena-patch datasets once;
2. analyzes the `ALL` cohort and rejects any status other than `healthy`;
3. analyzes each concrete class with at least 20 current-cohort runs;
4. requires a usable draft-advisor context for every selected class;
5. atomically saves the complete batch of class snapshots;
6. makes the accepted source batch available to request-time calculations;
7. writes a bounded operational run record and emits one structured event.

The run is all-or-nothing. Candidate source data is not committed to the
in-memory cache and no snapshot is published until every selected class has
passed.

Only one refresh may execute in a process. A concurrent manual or scheduled
request joins the active promise and reports `deduplicated: true`.

## Administrator API

### Status

`GET /api/admin/arena-draft-refresh`

Returns the schedule, whether a run is active, last attempt/success timestamps
and at most 24 sanitized run records.

### Manual refresh

`POST /api/admin/arena-draft-refresh`

Requires the existing administrator guard and same-origin CSRF check. It runs
the same pipeline as the scheduler and returns the completed sanitized run.

The API never returns raw source payloads, player identifiers, environment
values, filesystem paths or upstream error messages.

## Persistent state

`arena-draft-refresh-state-v1.json` in `SERVER_DATA_DIR` contains:

- schema version and update timestamp;
- current schedule metadata;
- active state;
- last attempt and last success;
- up to 24 completed runs.

Each run stores a generated run ID, trigger, timestamps, status, duration,
cohort ID, patch, source row count, published class IDs and a bounded error
code. A run left active by process termination is recovered as
`PROCESS_INTERRUPTED` on the next startup.

Arena model snapshots remain in `arena-synergy-history-v2.json`. The history
store gains a batch operation that validates every snapshot and performs one
atomic durable write.

## Observability

On-call questions:

1. When did the last successful refresh complete?
2. Is the pipeline currently failing or being deduplicated?
3. How long do refreshes take and how many classes were published?
4. Which safe failure category prevented publication?

Signals:

- structured `arena_draft_refresh_completed` events correlated by `runId`;
- Prometheus counters by bounded status and trigger;
- a refresh-duration histogram;
- gauges for last success time, source rows and published class count;
- the administrator status endpoint and persistent run ledger.

No raw error text or source content is logged.

## Threat model

Trust boundaries are the three external HS data responses and the
administrator-triggered mutation.

- Spoofing/elevation: existing administrator guard protects both endpoints.
- Tampering: existing normalizers, patch isolation and data-quality gates
  validate untrusted source data before publication.
- Repudiation: every run has a generated ID, trigger and durable timestamps.
- Information disclosure: allowlisted status fields and generic error codes.
- Denial of service: one in-process run, source timeouts, fixed 500-run
  analysis limit, bounded history and `node-cron` overlap prevention.
- CSRF: the manual POST uses the existing same-origin mutation check.

## Project structure

- `server/adminArenaSynergyService.ts`: shared source manager and batch refresh.
- `server/arenaDraftRefreshPipeline.ts`: run coordination and state ledger.
- `server/arenaSynergyHistoryStore.ts`: atomic batch publication.
- `server/adminArenaSynergyRoutes.ts`: protected status/manual endpoints.
- `server/metrics.ts`: bounded refresh metrics.
- `tests/arena-draft-refresh-pipeline.test.ts`: pipeline state and concurrency.
- Existing Arena service, route, history and metrics tests cover integration.

## Testing strategy

- Small tests: state recovery, sanitization, deduplication and failed-run
  preservation.
- Medium tests: one upstream fetch batch, healthy multi-class publication,
  rejection of warning data, no partial persistence and protected manual API.
- Existing regression suites: Arena analysis, advisor, history, routes,
  metrics and release contracts.

## Boundaries

- Always: use the current patch cohort, publish only healthy data, write state
  atomically, preserve last-known-good snapshots and keep all labels bounded.
- Ask first: add a new data provider, change authentication, train weights,
  introduce a database or collect draft/player telemetry.
- Never: persist raw runs or player IDs, expose upstream errors, publish a
  partial class batch or score redraft as causal evidence.

## Acceptance criteria

- A scheduled or manual run refreshes all eligible classes from one source
  batch.
- Concurrent runs do not duplicate upstream requests.
- Warning, blocked, malformed or unavailable data leaves snapshots and source
  cache unchanged.
- A successful run publishes all snapshots in one atomic history write.
- Interrupted and failed runs are visible through sanitized state and metrics.
- Existing draft advice API continues to use the newly accepted source batch.
- Focused tests, security scans, production build and release gate pass.
