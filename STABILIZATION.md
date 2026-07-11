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
- [ ] Phase 2: one route registry and shared frontend components.
  - [x] One typed route registry owns navigation groups, access entitlements, path resolution and SEO metadata.
  - [x] Shared subscription purchase controls replace the first cross-bundle component duplicate.
  - [x] One subscriber gate owns paywall accessibility, actions and private-preview isolation across bundles.
  - [x] One resilient avatar component owns profile imagery and missing-image fallback across bundles.
  - [x] CI enforces a no-growth duplicate-component budget while the remaining legacy copies are extracted.
  - [x] Shared FAQ owns stable controls, panel relationships and content across Arena data pages.
  - [x] Full-page Arena, profile, admin and article implementations have a single lazy-route owner instead of shadow copies in `App.tsx`.
- [ ] Phase 3: layered CSS and removal of legacy cascade.
- [ ] Phase 4: modular API, runtime validation and durable data snapshots.
- [ ] Phase 5: isolated scraper publishing.
- [ ] Phase 6: immutable deployment, readiness and rollback.
- [ ] Phase 7: structured telemetry, alerts and backup/restore.
- [ ] Phase 8: performance, accessibility and final production audit.

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
