<!-- markdownlint-disable MD013 -->

# HS-Arena stabilization programme

This document is the operational source of truth for making HS-Arena safer,
more predictable and easier to maintain. Work is delivered as small tasks;
every completed task must be tested and pushed to `main` as a separate commit.

## Baseline — 2026-07-11

| Area | Current evidence | Stabilization target |
| --- | --- | --- |
| Frontend shell | `src/App.tsx`: 8,193 lines | Shell, routing and global session only |
| Deferred frontend | `src/features/DeferredRoutes.tsx`: 7,786 lines | Small lazy-export index or removed |
| Exact named frontend duplicates | At least 20 components | Zero shared-component duplicates |
| Backend | `server/index.ts`: 9,041 lines, 93 Express routes | Route/service/repository modules |
| Specialized tests | 2 scripts | Unit, contract and E2E coverage by route family |
| Visual QA | 4 routes, primarily guest state | Critical routes in guest/locked/subscriber states |
| CI | Scheduled scraper only | Required validation workflow on every push and PR |
| Deployment | Live working tree, server started through `tsx` | Immutable compiled release with health rollback |
| Initial JS | About 267 KB raw | No growth, then 250 KB, finally 220 KB |
| Main CSS | About 324 KB raw | No growth, then staged reduction |
| Data publishing | Scraper can commit directly to `main` | Validated isolated data publishing |
| Observability | Journald and `/api/status` | Request IDs, readiness, error tracking and alerts |

## Current checkpoint — frontend ownership

The first architecture ratchet is complete:

- `src/App.tsx` is down from 8,193 to 3,677 lines;
- `src/features/DeferredRoutes.tsx` is down from 7,786 to 6,878 lines;
- exact named component duplicates across those bundles are down from at least
  20 to zero;
- CI now rejects the first reintroduced duplicate rather than allowing a
  temporary no-growth budget.

## Service-level objectives

| Objective | Target | Evidence |
| --- | --- | --- |
| Public availability | At least 99.9% monthly | External uptime monitor |
| API latency | `/api/status` p95 below 500 ms | Request metrics |
| Arena data freshness | Last successful dataset no older than 8 hours | Data health endpoint |
| Frontend runtime | Zero uncaught errors in critical flows | Browser error tracking and E2E |
| Mobile layout | No document overflow at 390 px | Automated viewport assertion |
| Deployment success | At least 98% without manual repair | Release log |
| Rollback time | Under 5 minutes | Automated rollback drill |
| Critical MTTR | Under 30 minutes | Incident log |

## Health contracts

- `GET /health/live` proves that the HTTP process can answer; it has no
  external dependency and is never cached.
- `GET /health/ready` proves that the required Arena snapshots exist and have
  valid timestamps. Stale-but-usable snapshots remain ready so a temporary
  scraper outage does not remove the site from service.
- `GET /health/data` enforces the eight-hour freshness SLO and returns `503`
  for stale, missing, invalid or implausibly future-dated datasets.
- Redis is an optional acceleration layer and therefore never blocks
  readiness.
- The same contracts are mounted below `/api/health/*` for external monitors,
  because the production reverse proxy forwards `/api/*` to Node while direct
  `/health/*` remains available to local service probes.

## Metrics and alert contracts

- `GET /metrics` and externally reachable `GET /api/metrics` return uncached
  Prometheus text without user identifiers, query strings or raw URLs.
- HTTP counters use bounded Express route templates and status classes;
  duration histograms use fixed buckets so p95 can be calculated without
  retaining individual requests.
- Page the operator immediately when `hs_arena_ready` is zero for two minutes
  or when 5xx responses exceed 2% of requests for five minutes.
- Warn when API p95 exceeds 500 ms for ten minutes and page when it exceeds
  two seconds for five minutes.
- Warn when any `hs_arena_dataset_age_seconds` exceeds six hours; page at the
  eight-hour freshness SLO or whenever its state is missing or invalid.
- Page when the public liveness probe fails from two independent regions for
  two consecutive checks. A single-region failure is a warning.
- Every alert must include the active `hs_arena_release_info` SHA, affected
  route or dataset, first-seen time and the relevant rollback/runbook link.

## Route and access inventory

### Public and editorial routes

| Route family | State | Critical API or dependency | Required QA |
| --- | --- | --- | --- |
| `/` | Public | Home summary and articles | desktop/mobile, partial API failure |
| `/articles`, `/articles/:slug` | Public or article entitlement | Articles API and media | list/detail/error/mobile |
| `/gallery` | Public | Gallery media | list/lightbox/download/mobile |
| `/contests` | Public shell, protected actions | Auth, subscription, contest API | guest/member/admin |
| `/guides-archive`, `/guides-archive/:slug` | `guidesArchive` | Guide API and HTML sanitizer | locked/list/detail/mobile |
| `/standard/matchups` | `standard` | HSGuru matchup proxy/cache | locked/subscriber/error/table |

### Arena routes

| Route family | Entitlement | Critical API | Required QA |
| --- | --- | --- | --- |
| `/classes` | `arena` | Winrates and source switching | locked/subscriber/loading/error |
| `/tierlist` | `arena` | Tier list, images and source switching | filters/lightbox/mobile |
| `/legendaries` | `arena` | Legendary groups and fallback snapshot | empty rejection/source/lightbox |

### Battlegrounds routes

| Route family | Entitlement | Critical API | Required QA |
| --- | --- | --- | --- |
| `/heroes`, `/heroes/:dbfId` | `battlegrounds` | BG hero proxy/details | list/detail/media/lightbox |
| `/library/**` | `battlegrounds` | BG library proxy/cache | pool/archive/filter/detail/golden |
| `/battlegrounds/tier-list` | `battlegrounds` | BG tier lists | all tabs/filter/show-more/lightbox |
| `/battlegrounds/strategies` | `battlegrounds` | Legacy library/card art | mount/drag/drop/export |
| `/battlegrounds/tier-builder` | `battlegrounds` | Legacy tier data/card art | mount/order/export/mobile |

### Identity and administration

| Route or state | Access | Required QA |
| --- | --- | --- |
| `/?login` | Guest | login/register/verify/reset/Telegram |
| `/?profile` and signed-in profile | Authenticated | contacts/subscription/link/logout |
| `/admin` and `?admin` | Admin allowlist | denied/admin/actions/audit |
| Mobile navigation | Everyone | open/group/tap/close/scroll lock |
| All lightboxes | Route-specific | keyboard/close/local scroll/body restore |

## Required UI states

Every critical route must be verifiable in these states when applicable:

1. Guest.
2. Authenticated without entitlement.
3. Authenticated with the required entitlement.
4. Administrator.
5. Initial loading.
6. Cached data plus background refresh.
7. Empty upstream response.
8. Invalid upstream response.
9. Network or upstream failure.
10. Restored tab after `pagehide`/`pageshow`.

## Definition of Done

A task is complete only when all relevant checks below are proven.

- [ ] Acceptance criteria are stated before implementation.
- [ ] `npm run lint` passes.
- [ ] Relevant unit and contract tests pass.
- [ ] `npm run build` passes.
- [ ] Bundle budget passes or the task includes an approved ratchet update.
- [ ] Guest and entitled behavior are covered where access differs.
- [ ] Critical guest/subscriber states have zero axe WCAG 2.2 A/AA violations.
- [ ] Desktop and 390 px mobile rendering are checked for UI work.
- [ ] `document.documentElement.scrollWidth === innerWidth` at 390 px.
- [ ] No new browser console error is introduced.
- [ ] Loading, empty and error states remain usable.
- [ ] No secret, token, cookie or personal data is logged.
- [ ] Documentation and changelog are updated when behavior changes.
- [ ] The change is committed separately and pushed to `main`.
- [ ] Production changes include health verification and a rollback path.

## Stop-the-line rules

- Never deploy a build that failed a required CI gate.
- Never treat an empty upstream dataset as a successful replacement snapshot.
- Never alter a duplicated component in only one location; extract or update all
  active implementations with coverage first.
- Never add an unscoped mobile shell selector.
- Never put absolute decorative layers in an unpositioned owner.
- Never run a destructive data migration without a tested restore procedure.
- Never publish directly from a mutable working tree once immutable releases
  are available.

## Delivery phases

- [ ] Phase 1: required CI, staging and authenticated E2E/visual QA.
  - [x] Required typecheck, unit-test, build, budget and docs workflow.
  - [x] Deterministic guest/subscriber browser QA at desktop and mobile widths, including dimming, overflow, menu and lightbox scroll-lock regressions.
  - [x] CI serves the built frontend locally and runs the deterministic desktop/mobile flows with axe-core WCAG 2.2 A/AA checks before a commit can pass.
- [x] Phase 2: one route registry and shared frontend components.
  - [x] One typed route registry owns navigation groups, access entitlements, path resolution and SEO metadata.
  - [x] Shared subscription purchase controls replace the first cross-bundle component duplicate.
  - [x] One subscriber gate owns paywall accessibility, actions and private-preview isolation across bundles.
  - [x] One resilient avatar component owns profile imagery and missing-image fallback across bundles.
  - [x] CI enforces a no-growth duplicate-component budget while the remaining legacy copies are extracted.
  - [x] Shared FAQ owns stable controls, panel relationships and content across Arena data pages.
  - [x] Full-page Arena, profile, admin and article implementations have a single lazy-route owner instead of shadow copies in `App.tsx`.
  - [x] All remaining exact named component duplicates and retired deck-page helpers have been removed; CI enforces a zero-duplicate budget.
- [ ] Phase 3: layered CSS and removal of legacy cascade.
  - [x] One canonical `src/styles/tokens.css` owns every global `:root` token; CI rejects secondary root owners, duplicate tokens and growth beyond the measured 2,724 legacy `!important` declarations.
  - [x] The isolated Guides Archive stylesheet no longer needs eight defensive image overrides because its extracted HTML sanitizer removes hostile legacy layout attributes before rendering; the CI ceiling is now 2,716.
  - [ ] Replace legacy overrides route by route and ratchet the `!important` ceiling down after every verified batch.
  - [ ] Establish explicit reset, base, component, route and override layers once all participating stylesheets can enter the layer order without changing precedence.
- [ ] Phase 4: modular API, runtime validation and durable data snapshots.
  - [x] Old-guide HTML and URL normalization have moved out of `server/index.ts` into a pure tested sanitizer module with explicit unsafe-protocol, event-handler, inline-style and decorative-image rejection coverage.
  - [x] Dataset freshness evaluation and Express health handlers are isolated modules with unit and HTTP contract tests for fresh, stale, missing, invalid and clock-skewed data.
- [x] Phase 5: isolated scraper publishing.
  - [x] Supported scraper documents are structurally validated and durably published through same-filesystem staging, file and directory `fsync`, and atomic rename; empty/incomplete results cannot replace the last good snapshot.
  - [x] Puppeteer scraping runs only in one systemd oneshot controlled by a six-hour timer and a manual-request path unit; the API queues requests without scraping in-process, and successful publications invalidate process and Redis caches through a durable marker.
  - [x] The standalone scraper exits non-zero when any critical Arena dataset fails, allowing systemd monitoring to distinguish partial upstream failure from success.
- [x] Phase 6: immutable deployment, readiness and rollback.
  - [x] Dedicated liveness, readiness and strict data-health endpoints expose uncached machine-readable deployment gates without changing the legacy public status response.
  - [x] CI emits a readable compiled Node server artifact and starts it against isolated temporary snapshots/SQLite to verify direct health, proxied health and legacy status contracts without `tsx`.
  - [x] systemd runs compiled Node from `current`, nginx serves `current/dist`, mutable data lives in `shared/server-data`, and the former workspace remains only the build source.
  - [x] Release tooling now emits checksum manifests, separates lockfile-addressed dependencies and mutable data, makes releases read-only, switches `current`/`previous` atomically and automatically rolls back failed readiness; success, repeat-deploy and forced-failure paths are tested outside production.
  - [x] A production rollback drill completed in one second and verified both previous and restored-current release SHAs through liveness.
- [ ] Phase 7: structured telemetry, alerts and backup/restore.
  - [x] Every HTTP response carries a validated or generated request ID; completed, failed and aborted requests emit one-line JSON records with normalized routes, status, duration and response size, while an allowlist prevents query strings, cookies, authorization headers, request bodies and raw error messages from entering logs.
  - [x] Prometheus text export exposes bounded-route latency histograms, status-class counters, active requests, readiness, data freshness/age and active release; concrete warning and paging thresholds are documented.
  - [x] Daily GnuPG AES-256 backups capture shared data/uploads plus a consistent ecosystem SQLite snapshot; a weekly isolated restore drill verifies the archive checksum, per-file manifest, required datasets and SQLite integrity, with tamper rejection covered in CI.
  - [ ] Replicate encrypted archives and the recovery key to separate offline failure domains and test a full host-loss recovery.
- [ ] Phase 8: performance, accessibility and final production audit.
  - [x] Automated WCAG 2.2 A/AA audits cover critical Arena subscriber routes at desktop/mobile widths, the guest paywall, open mobile navigation and open card lightbox; the initial contrast violation was fixed and CI now requires zero axe violations.
  - [ ] Complete manual keyboard, VoiceOver/TalkBack, 200% zoom, forced-colors and reduced-motion checks on the route inventory.
  - [x] Initial JS is down from 266.8 KB to 249.2 KB by splitting below-fold home directories, FAQ/paywall UI and the delayed support prompt; CI now enforces the 250 KB ceiling and browser QA proves every lazy surface still loads and remains accessible.
  - [ ] Ratchet initial JS to 220 KB and main CSS to 300 KB, then profile the next route-level reductions.

## Progress metrics

Review weekly:

- shared component duplicate count;
- percentage of critical routes covered by guest and subscriber E2E;
- CI pass rate and median duration;
- deployment success and rollback duration;
- frontend uncaught errors per route;
- API 5xx rate and p95 latency;
- Redis hit/miss/stale rate;
- age of the last valid dataset;
- initial JS, largest route JS and CSS size;
- accessibility violations by severity;
- repeat regressions and MTTR.
