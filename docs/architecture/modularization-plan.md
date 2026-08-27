# Modularization and performance plan

## Status

Accepted as the working architecture plan on 2026-07-29.

This plan is intentionally incremental. Each slice must preserve public routes,
API contracts and visible behavior, pass the production checks, and be safe to
deploy independently.

The governing module boundaries, dependency rules and documentation contract
are defined in [`module-boundaries.md`](module-boundaries.md) and accepted by
[`ADR 002`](../decisions/002-domain-modules-and-documentation-contract.md).
This file tracks migration order; those documents define how every slice is
structured and completed.

## Baseline

The production build at commit `21daa508` exposed the following hotspots:

| Module | Lines |
| --- | ---: |
| `server/index.ts` | 9,966 |
| `src/features/DeferredRoutes.tsx` | 6,689 |
| `src/features/Battlegrounds.tsx` | 4,373 |
| `src/App.tsx` | 1,966 |
| `server/constructedCardRoutes.ts` | 1,591 |
| `src/features/StandardCards.tsx` | 1,610 |

These files mix composition with route, data, policy and presentation concerns.
Their individual decomposition targets are listed below.

The same build produced large route-owned JavaScript chunks:

| Chunk | Raw size |
| --- | ---: |
| `DeferredRoutes` | 114.97 kB |
| `StandardCards` | 93.24 kB |
| `Battlegrounds` | 117.77 kB |
| `Contests` | 132.71 kB |

Selecting one export from `DeferredRoutes.tsx` still downloads the whole chunk.
That makes the file both a maintenance hotspot and a navigation-performance
hotspot.

The constructed-card catalog also warmed every rank and period after a filter
change. A sampled 60-card payload was about 125 kB, so the old policy could
transfer more than 1 MB of background JSON while visible card images were still
loading.

## Module boundaries

Feature code should follow this dependency direction:

1. Route entry: resolves the route and composes the feature.
2. Controller or hook: owns browser state and asynchronous orchestration.
3. Model: pure types, validation, transformations and policy.
4. Data client: owns HTTP calls, cache keys and response boundaries.
5. View components: render typed inputs and emit user intent.

Views may depend on models. Models must not import React, browser globals, route
components or data clients. Data clients must not render UI.

On the server, `server/index.ts` is a composition root. New route behavior must
live in a route module and receive its dependencies explicitly. The composition
root may register middleware and routers, but it must not become the owner of
new domain logic.

## Enforced ratchet

`npm run lint:architecture` checks line budgets for the known hotspots. Budgets
start at the current production baseline and may only stay unchanged or move
down. A feature that needs more code in one of these files must first extract a
focused module.

The budgets are not target sizes. They are a temporary ceiling that prevents
new spaghetti while the files are split. The long-term target is:

- route entry modules below 300 lines;
- models and data clients below 250 lines;
- view modules below 500 lines;
- the server composition root below 500 lines.

## Delivery order

Each numbered area is delivered as a sequence of small vertical slices, not as
one broad rewrite. A slice should normally change no more than five authored
files, keep the application deployable and lower the ratchet it replaces.

### 0. Safety guardrails

Status: test discovery implemented on the current `origin/main` baseline;
additional guardrails remain incremental.

- [x] Add a deterministic architecture baseline for product file count, LOC,
  large files, raw fetch, module boundaries, runtime/type-only cycles,
  TypeScript debt, test reachability, built bundle sizes, CSS `!important` and
  inline styles.
- [x] Discover authored `*.test.*` and `*.spec.*` files repository-wide and
  require every file to belong to exactly one of `unit`, `integration`,
  `contract`, `browser`, or `production-smoke`.
- [x] Replace the manually chained `npm test` command with a checked registry
  runner. The filesystem is authoritative, exclusions require a central
  rationale, per-file environment does not leak, and CI fails on any new
  unclassified test.
- [x] Add rejected-promise characterization coverage and a typed Express 4
  forwarding wrapper. The first bounded migration covers the two protected
  ecosystem subscription routes; remaining handlers move only with focused
  contract coverage.
- [x] Record and enforce the current module dependency graph: runtime cycles and
  new boundary violations fail CI, while the four inherited type-only cycles
  have exact, justified, owner-bound removal entries.
- [x] Snapshot every authored Express route and middleware registration with
  exact static paths, source order and explicit guard evidence; unresolved path
  expressions and unreviewed snapshot drift fail the architecture gate.
- [x] Align README with the non-strict TypeScript baseline, test discovery and
  legacy `features` status; make `docs/decisions/` the single ADR home and
  distinguish architecture, specifications, operations and runbooks.
- [x] Add a bounded, idempotent process lifecycle and migrate the subscription
  refresh cron as the first owned job with a compiled `SIGTERM` smoke test.
- [ ] Move the remaining intervals, startup timers, database/Redis handles and
  Arena refresh job behind explicit lifecycle resources.
- [x] Prove and remove the retired private `DeferredRoutes.AdminPanel` and its
  exclusive declarations without changing the live `ContestAdminPanel` route.
- [ ] Classify the remaining Knip candidates before any further dead-code
  removal; tool output alone is not deletion evidence.

The reproducible discovery baseline and rollback contract are documented in
[`phase0-test-discovery.md`](phase0-test-discovery.md). The slice is based on
`57dfb48fffb0bcfec4e4dc6eb69298bcdab838e2`; the earlier Phase 0 branch is not
an integration base. The first async-handler migration and its rollback
contract are documented in
[`phase0-async-express.md`](phase0-async-express.md).
The metric definitions, reproduction commands and first measured values are in
[`phase0-reproducible-baseline.md`](phase0-reproducible-baseline.md).
The first evidence-backed dead-code removal and its route guard are documented
in [`phase0-dead-code.md`](phase0-dead-code.md).
Compatibility coverage and the remaining lifecycle/cache gaps are documented
in [`phase0-compatibility-harness.md`](phase0-compatibility-harness.md).
The bounded process shutdown and first owned job are documented in
[`phase0-process-lifecycle.md`](phase0-process-lifecycle.md).

### 1. Constructed-card catalog model

Status: complete.

- Move filter defaults, URL serialization and adjacent-prefetch policy into a
  pure model.
- Bound idle warming to three likely transitions.
- Cover request serialization and boundary selection with direct tests.

### 2. Arena deferred routes

Status: in progress. The gallery route and shared editorial chrome have been
extracted into dedicated modules. The retired private admin implementation was
removed; `/admin` continues to load the separately owned `ContestAdminPanel`.

- Extract shared Arena card types and formatting into explicit domain models.
- Give win rates, tier list, legendaries, auth and articles separate lazy route
  entry points, one route per slice.
- Keep only genuinely shared primitives in a small common module.
- Measure each resulting chunk and lower the `DeferredRoutes` budget.

This is the highest-impact bundle split because six public routes currently
share one 115 kB download.

### 3. Constructed-card list and detail routes

- Extract the catalog controller and list views.
- Extract detail media, related-card and deck sections.
- Lazy-load detail-only code, DeckView and history visualization.
- Add separate route chunk budgets for list and detail pages.

### 4. Battlegrounds routes

- Separate heroes, tier list, strategy builder and tier builder entry points.
- Move shared card-image and tribe policies into existing focused models.
- Verify image placeholders and route transitions in the browser.

### 5. Server composition

Status: in progress. The protected ecosystem user and subscription endpoints
are the first extracted server domain slice.

- Move remaining inline route families out of `server/index.ts`.
- Separate request parsing, domain services and response serialization.
- Keep authorization and rate-limit policy at explicit route boundaries.
- Add endpoint latency measurements before and after each extraction.

The first slice exposes `server/modules/ecosystem/public.ts` as its only public
entry point. The composition root still owns authentication, user lookup,
subscription persistence and refresh infrastructure; the module owns only the
three compatible HTTP routes and receives those capabilities as explicit
dependencies. A direct contract test preserves the existing guard, private
cache policy, error payloads, response shapes and exact `force=1` behavior.

### 6. Application shell

- Move route preload policy into a route manifest.
- Move authentication and subscription orchestration into focused hooks.
- Remove duplicated Arena data types after their route modules own them.
- Keep `App.tsx` responsible only for shell composition and route selection.

## Definition of done for every slice

- The slice has one named owner and one public entry point.
- Dependencies follow the `app -> modules -> shared` contract and no other
  module imports its internals.
- Existing public URLs, response shapes and permissions remain compatible.
- Pure behavior is tested without rendering the whole application.
- React changes pass React Doctor; TypeScript changes pass Semgrep.
- Type checking, focused tests, production build and budgets pass.
- Browser checks cover the changed route, keyboard behavior and console.
- The task resolves its declared `Documentation impact`; code and its owning
  architecture, specification, decision, runbook or changelog stay consistent.
- The line and bundle budgets are lowered when a hotspot becomes smaller.

## Performance measurement

Use the same before-and-after path for every optimization:

- record production TTFB and response size for affected API requests;
- record built raw and gzip chunk sizes;
- test cold navigation and a repeated navigation;
- test filter input and mode switches for interaction latency;
- observe LCP, INP and CLS in a real browser;
- verify slow-network behavior without background requests competing with
  above-the-fold images.

Optimizations without a baseline or a regression check are incomplete.
