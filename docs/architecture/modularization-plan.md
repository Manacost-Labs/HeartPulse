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

## Sources of truth

This roadmap is the program index, not a replacement for focused contracts.
Read the owning source before changing a workstream:

| Workstream | Governing source |
| --- | --- |
| Module ownership and dependency direction | [`module-boundaries.md`](module-boundaries.md), [`config/module-boundaries.json`](../../config/module-boundaries.json), ADR-002 |
| Application routes and SEO ownership | [`application-route-manifest.md`](../specs/application-route-manifest.md), [`SEO-STRATEGY.md`](../roadmaps/SEO-STRATEGY.md), ADR-010 |
| Administrator workspace | [`admin-tailadmin-workspace-shell.md`](../specs/admin-tailadmin-workspace-shell.md) |
| Mobile and responsive quality | [`MOBILE-QUALITY-ROADMAP.md`](../roadmaps/MOBILE-QUALITY-ROADMAP.md) |
| Stability and recovery | [`STABILITY-ROADMAP.md`](../roadmaps/STABILITY-ROADMAP.md) |
| Public static delivery and card images | [`global-static-asset-delivery.md`](../specs/global-static-asset-delivery.md), [`timeweb-cdn-image-delivery.md`](../specs/timeweb-cdn-image-delivery.md), ADR-008 and ADR-009 |
| Regional telemetry | [`regional-performance-telemetry.md`](../specs/regional-performance-telemetry.md), [`production-monitor.md`](../runbooks/production-monitor.md) |
| CDN operations and rollback | [`global-edge-rollout.md`](../runbooks/global-edge-rollout.md), [`timeweb-cdn-rollout.md`](../runbooks/timeweb-cdn-rollout.md) |
| Security and release | [`SECURITY.md`](../../SECURITY.md), [`DEPLOYMENT.md`](../../DEPLOYMENT.md), ADR-001 |

The canonical ADR directory is `docs/decisions`. The older
`docs/adr/0001-public-url-indexability.md` remains a historical input until a
dedicated documentation slice migrates it without changing URL policy.

## Execution and status contract

Notion is the operational source for task status; this document owns order,
dependencies and exit gates. Use only `planned`, `in progress`, `review`,
`integrated` and `deployed`. An active slice records its Notion task, checked
ownership id (or the repository-tooling owner), accountable team, dependencies,
at most three observable completion criteria, expected files/documents,
verification commands and rollback. Status changes in this roadmap and Notion
happen together; commit and check evidence is attached when a slice reaches
`review` or later.

Every implementation item is S or M. An XL phase below is a program heading,
not an executable task. Split it until one owner can safely ship the result in
one independently deployable change. Use this slice card:

```text
ID and outcome:
Status / owner id / size:
Dependencies:
Likely code and owning documents:
Done (maximum three observable checks):
Verification commands and saved before/after evidence:
Rollback:
```

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

## Target filesystem architecture

The directory tree must answer three questions without a repository-wide
search: who owns a capability, which file is its public entry, and which tests
prove it. The target shape is:

```text
src/
  app/
    bootstrap/
    providers/
    routing/
    shell/
  modules/
    arena/
    battlegrounds/
    constructedCards/
    standardMeta/
    decks/
    identity/
    subscriptions/
    editorial/
    cosmetics/
    community/
    developerApi/
    adminWorkspace/
  shared/
    api/
    config/
    lib/
    telemetry/
    ui/

server/
  app/
    middleware/
    routes/
  modules/
    <domain>/
  shared/
    auth/
    cache/
    db/
    http/
    observability/

shared/
  contracts/
    <domain>/

tests/
  modules/
    client/<domain>/
    server/<domain>/
  contracts/
  architecture/
  browser/
```

Folders are created only when a real responsibility moves into them. Empty
scaffolding does not improve discoverability. A client domain normally grows
from this template:

```text
<domain>/
  public.ts
  public.css              # optional checked eager style entry
  routes/*.route.tsx
  model/*.ts
  api/*.api.ts
  hooks/*.ts
  ui/*.tsx
  ui/*.css
  ui/*.stories.tsx
```

A server domain uses:

```text
<domain>/
  public.ts
  routes/*.route.ts
  service/*.service.ts
  repository/*.repository.ts
  model/*.ts
  schema/*.schema.ts
```

`public.ts` is the only supported cross-domain code import. A client module may
declare one `public.css` when the application shell needs eager styles; all
other CSS remains private. There is no global application barrel. CSS, stories
and focused tests stay visibly associated with their owner. Names such as
`utils`, `common`, `helpers` and `misc` are not owners and must not become
directories.

## AI navigation contract

The schema-v3 module inventory is now the checked map a human or AI agent reads
before editing. Canonical modules, owned shared roots and transitional
`migrationAreas` together cover module-owned, cross-module primitive and legacy
product source. Each applicable record contains:

- stable module id, purpose and owner;
- public client routes and server mounts;
- public entries and declared module dependencies;
- owned state stores, cache keys and external data sources;
- focused tests, browser scenarios, specifications and runbooks;
- safe starting files and exact temporary migration debt.

Generated commands should expose that map without duplicating it in prose:

- `agent:context -- <module-or-path-or-root>`: owner, purpose, public entry or
  migration targets, routes, safe starts, tests, documents and known debt;
- `agent:check -- <module-id-or-path-or-root>`: focused type, test and boundary
  checks;
- `agent:impact -- <path>`: affected modules, routes, contracts and tests;
- `agent:map`: generated client/server dependency and route ownership map.

Route details are hydrated from the existing public route inventory through
checked owner scopes; no parallel URL registry is maintained. `root` and `.`
produce the deterministic whole-project surface. Missing or multiply-owned
product source fails the architecture gate instead of silently returning an
empty AI context.

### Golden path for an AI-authored capability

1. Resolve the nearest existing owner with `npm run agent:context -- <path-or-id>`
   and inspect reverse impact before creating a new domain.
2. Put behavior in the owner-specific `model`, `api`, `hooks` and `ui` folders
   only as needed; expose the smallest cross-domain surface from `public.ts`.
3. Add or update exactly one checked inventory owner with its focused tests,
   documentation, safe starts and declared dependencies.
4. Register new tests in the test registry and colocate stories with reusable
   UI; add a specification, ADR or runbook only when its contract changes.
5. Run `agent:impact`, `agent:check`, the architecture gate and the relevant
   browser or operations check. Lower the replaced file/bundle ratchet.

If no existing owner fits, write the purpose and dependency direction first;
do not create a new module merely to hold one helper. This recipe is also the
review checklist for an AI-generated change.

## Delivery roadmap and visible outcome

The roadmap is ordered by risk and user value. Every milestone must leave a
working release candidate; dates are assigned only after the preceding quality
gate is green.

| Priority | Milestone | Exit gate |
| --- | --- | --- |
| P0 | Checked ownership map | boundary graph green |
| P0 | Identity security cutover | coordinated release green |
| P1 | Application shell | shell below 500 lines |
| P1 | Cards and Battlegrounds | global page/filter/image budgets green |
| P1 | Administrator workspace | access and UI matrix green |
| P1 | Observability | owned SLO dashboard, alerts and recovery probe green |
| P2 | Standard, decks and editorial | legacy route bundle removed |
| P2 | Server domains | server root below 500 lines |
| P2 | Contracts | zero crossings and cycles |
| P3 | Legacy removal and AI commands | generated agent tools green |

The ownership map makes each owner, public entry, dependency, test and document
discoverable before an edit. The identity cutover delivers safe Telegram
sign-in/linking, one KHA writer and auditable immutable ownership. The shell
isolates authentication and subscription state. Cards and Battlegrounds deliver
current heroes, responsive filters and progressive full-quality media. The
TailAdmin-inspired workspace supplies a consistent accessible frame while each
product page stays with its domain. Later phases split Standard, decks and
editorial routes, reduce server adapters to composition, add measurable
operations signals and finally expose the generated AI navigation commands.

Target user-experience gates for primary public routes are Core Web Vitals at
the 75th percentile (`LCP <= 2.5 s`, `INP <= 200 ms`, `CLS <= 0.1`), no
horizontal overflow at 320 px, keyboard-visible focus and useful loading,
empty, failure and recovery states. These are target service levels, not claims
about the current production baseline. Image optimization may lower tile
transfer size but must preserve the documented `detail` and `original` quality
classes.

## Executable program backlog

These are the next bounded slices. The phase descriptions later in this
document explain the target architecture; this table is the hand-off queue an
agent can execute without first converting an XL phase into a task.

<!-- markdownlint-disable MD013 -->

| ID | Priority / size | Ownership scope / team | Depends on | Outcome and evidence |
| --- | --- | --- | --- | --- |
| `PERF-01` | P0 / M | `client.applicationComposition` / `web-platform` | none | Save one cold/warm baseline for pages, filters and image classes from RU, EU, North America, Asia and origin; include request waterfalls, p75/p95, bytes and release SHA. |
| `CDN-01` | P0 / M | `shared.crossRuntimeContracts` / `web-platform` | `PERF-01` | Reconcile every resource class with the coverage table in Phase 14; prove cache/fallback and credential boundaries with `test:cdn-delivery`, `test:network-boundary` and regional probes. |
| `BG-01` | P0 / M | `client.battlegrounds` / `web-platform` | none | Define patch/season roster identity, reject stale or incomplete live data and alert on freshness so new heroes reach library and strategy builder together. |
| `CARDS-01` | P0 / M | `client.featureLegacy` / `web-platform` | `PERF-01` | Extract visible-window image loading and filter orchestration; prevent background prefetch from competing with visible full-quality cards and save a before/after waterfall. |
| `UX-01` | P1 / M | `client.applicationComposition` / `web-platform` | route manifest | Classify all 25 surfaces and 48 URL policies by user priority/template, define state and viewport coverage, and attach desktop/mobile before screenshots to each changed primary surface. |
| `ADMIN-01` | P1 / M | `client.adminWorkspace` / `operations` | shell integrated | Move one authorized admin domain behind a lazy public entry with its RBAC matrix, list/filter/detail states, destructive confirmation rules and bundle evidence. Repeat per domain. |
| `SHELL-01` | P1 / M | `client.applicationComposition` / `web-platform` | identity and subscription contracts | Extract one provider or shell responsibility, preserve all route/Back/Forward behavior and lower the `App.tsx` ratchet. |
| `ROUTES-01` | P1 / M | `client.featureLegacy` / `web-platform` | application routing foundation | Extract one Arena or Standard route behind a focused lazy entry, direct model test and route chunk budget; lower the owning legacy ratchet. |
| `SERVER-01` | P1 / M | `server.applicationComposition` / `web-platform` | target server public entry | Move one HTTP family into route/service/repository boundaries with explicit dependencies, compatible HTTP tests and endpoint-latency evidence. |
| `OBS-01` | P1 / M | `server.applicationComposition` / `web-platform` | `PERF-01`, regional trust boundary | Publish owned dashboards and alerts for CWV, API latency/error rate, CDN hit/miss/fallback, regional parity, data freshness and Battlegrounds roster age; exercise one recovery runbook. |
| `ARCH-01` | P2 / M | repository tooling / `web-platform` | checker characterization complete | Implemented for review: metadata validation, exception policy, diagnostic/path and edge primitives have focused owners; the facade is 284 lines with an exact 284-line ratchet, six test suites stay below 500 lines and an AST gate enforces dependency direction. |
| `LEGACY-01` | P2 / S | checked area id / its declared owner | owning module slice | Remove one exact migration root or exception only after all consumers use the public entry; lower its architecture budget and update impact/docs. |

<!-- markdownlint-enable MD013 -->

For every row, the three default completion checks are: observable behavior is
preserved or deliberately specified, the relevant performance/size ratchet is
no worse, and `npm run agent:check -- <inventory-id-or-path-or-root>` plus the
owning browser or operational check is green. `npm run verify:ci` remains the
integration gate.

## Delivery order

Each numbered area is delivered as a sequence of small vertical slices, not as
one broad rewrite. A slice should normally change no more than five authored
files, keep the application deployable and lower the ratchet it replaces.

### 0. Safety guardrails

Status: review. Implementation is complete in the current architecture branch.

- [x] Forward rejected Express 4 route promises in the extracted ecosystem and
  article-vote routes to the existing structured error middleware, with direct
  rejection-path tests. The remaining inline subscription confirmation route is
  closed by its planned module extraction rather than by adding logic to the
  server composition root.
- [x] Remove source blocks proven unreachable by TypeScript and dependency
  analysis. This deleted 1,949 lines of retired admin, deck and application
  code from `DeferredRoutes.tsx` and lowered its ratchet from 6,435 to 4,468
  lines without changing a public export.
- [x] Add a machine-readable inventory for the nine initial modules and an
  AST-resolved dependency gate across TypeScript and JavaScript sources.
  Existing migration debt is represented only by exact, owned, expiring edges;
  the accepted graph has no runtime cycle.
- [x] Generate the test command from a checked registry so every discovered
  supported test file belongs to exactly one runnable suite and suite-only
  environment
  variables cannot leak into the remaining tests. Discovery scans the authored
  repository tree and rejects test files outside `tests/`, preventing colocated
  or unregistered tests from being silently skipped.
- [x] Make CodeGraph and focused module context available from isolated
  worktrees through safe project commands that synchronize the selected index
  and expose the module contract before broad source reads.

These guardrails land before additional route extraction so every later slice
has a narrow verification command and cannot add new dependency debt.

### 0.1 Public module-entry debt

Status: review. Implementation is complete and depends on Phase 0 integration.

- [x] Add the missing `server.arena` and `server.constructedCards` public
  entries and switch the legacy composition consumers to those contracts.
- [x] Export the loopback-only Battlegrounds statistics source through the
  existing `server.publicApi` entry instead of importing its implementation.
- [x] Expose one memoized lazy shell loader through
  `client.adminWorkspace/public.ts`; production and external stories await the
  same shell-and-styles Promise without importing private files.
- [x] Lower `missingPublicEntry` from 2 to 0 and `internalImport` from 6 to 0
  without adding an exception. The resulting graph has 414 sources, 695
  resolved edges and no runtime cycle.
- [x] Ratchet the administrator shell at 4.5 kB JS and 17 kB CSS and traverse
  the Vite manifest plus HTML entry assets so eager JS or CSS leakage fails the
  production budget.

### 0.2 Application routing foundation

Status: review. Implementation is complete and depends on Phase 0.1 integration.

- [x] Establish `src/app/routing/public.ts` as the explicit application routing
  entry and keep `src/routes.ts` as a derived compatibility facade only.
- [x] Record all 25 application surfaces, canonical paths, navigation metadata,
  entitlements, literal module loaders and preload policy in one typed manifest.
- [x] Keep the 48-entry public URL inventory authoritative for SEO, redirects,
  detail paths, legacy aliases, prerendering and final not-found settlement.
- [x] Move pure route settlement and browser history/metadata orchestration out
  of `App.tsx` without changing the history state contract.
- [x] Pin every id/path pair, all 19 loader identities and compatibility aliases
  in focused tests that do not execute a dynamic import.
- [x] Lower the `App.tsx` ratchet from 1,966 to 1,793 lines, preserve the route
  chunk topology and keep the authenticated primary navigation eager.
- [x] Keep static authenticated-avatar presentation in its owned CSS instead of
  startup JavaScript, preserving the rendered design while restoring startup
  transfer headroom without a granular avatar request.

This foundation is specified in
[`application-route-manifest.md`](../specs/application-route-manifest.md) and
accepted by [ADR-010](../decisions/010-application-route-manifest-and-navigation-layer.md).

### 1. Constructed-card catalog model

Status: integrated.

- Move filter defaults, URL serialization and adjacent-prefetch policy into a
  pure model.
- Bound idle warming to three likely transitions.
- Cover request serialization and boundary selection with direct tests.

### 2. Arena deferred routes

Status: in progress. The gallery route, shared editorial chrome and identity
login/profile surface have been extracted into dedicated owners.

- Extract shared Arena card types and formatting into explicit domain models.
- Give win rates, tier list, legendaries, auth and articles separate lazy route
  entry points, one route per slice.
- Keep Arena vocabulary with its owning domain model. Promote only a proven
  runtime-independent capability to an explicitly named `src/shared/<capability>`
  contract; never create a `common` or catch-all helper module.
- Measure each resulting chunk and lower the `DeferredRoutes` budget.

The remaining Articles, Win rates, Tier list and Legendaries surfaces now share
a 77.3 kB route chunk, down from the earlier 115 kB hotspot. Login intent owns
its separate 28.3 kB identity chunk and no longer warms `DeferredRoutes`,
Application Connect or the public-profile page.

### 3. Constructed-card list and detail routes

Status: in progress. The first server-catalog slices moved query parsing,
filtering, sorting, facets, statistics normalization, snapshot publishability
checks and catalog/statistics merging behind `server.constructedCards/public.ts`.
The module now also owns the data-service contract, service errors and durable
history store. Server consumers use that public entry, so the route/history
type cycle is gone. The legacy history-store path and contract re-exports on the
active route preserve compatibility while its endpoint implementation remains
to be split. Server composition supplies the public-term policy without
introducing a module-to-legacy dependency. The enforced
`constructedCardRoutes.ts` ceiling is now 1,234 lines instead of 1,591.

1. Extract catalog filters, URL/search state and request controller.
2. Extract list rendering, tile image policy and visible-window loading.
3. Extract detail media, related-card, generated-pool and deck sections.
4. Continue from the module-owned server history store by extracting the client
   history model/chart and lazy-loading detail-only visualization.
5. Split server catalog, detail, history, image and SEO endpoints behind the
   constructed-cards public entry.

Complete when `StandardCards.tsx` is below 500 lines or deleted,
`constructedCardRoutes.ts` is below 300 lines or replaced, list navigation does
not download detail-only code, the history cycle is gone, bounded prefetch does
not compete with visible images, and list/detail chunks have separate budgets.

### 4. Battlegrounds routes

Status: in progress. The first client slice registered
`client.battlegrounds/public.ts` as the owner of the hero-catalog, mode, MMR and
list-sorting contracts and removed the route/ledger type cycle. The second owns
the canonical full-quality portrait policy and the classic builders' complete
current-roster resolver: payload normalization, DBF localization, image
selection through an injected platform URL policy, tier sorting and the existing
gross-truncation guard. A frozen V1
compatibility port keeps request transport
in `public/bg-legacy/shared.js` until the builders become module entries. The
guard deliberately preserves the old row-count semantics; 75% of a bundled
snapshot detects a severely shortened response but cannot prove patch-level
completeness. The enforced `Battlegrounds.tsx` ceiling is now 4,343 lines
instead of 4,373.

1. [x] Extract current-roster normalization and the parity truncation guard
   behind the Battlegrounds public entry.
2. Define an authoritative patch/season roster identity and source-timestamp
   contract before replacing the parity guard with identity-aware completeness.
3. Extract hero list/detail and consume that checked roster contract so newly
   released heroes cannot disappear silently.
4. Extract library list/detail/archive.
5. Extract tier list, strategy builder and tier builder as separate lazy entries;
   remove `__hsArenaBattlegroundHeroRosterBridgeV1` in this step.
6. [x] Move the hero portrait/card-image policy into a focused model.
7. Move the remaining card-image and tribe policies into focused models.
8. Consolidate server proxy, image, SEO and statistics-source behavior behind
   the Battlegrounds public entry.

Complete when `Battlegrounds.tsx` is deleted, its four primary surfaces have
separate route chunks, new-hero freshness is monitored, type cycles are gone,
the public API uses only the public contract, and tile/detail/original image
quality plus placeholders and transitions pass browser checks.

### 5. Server domain-route extraction

Status: in progress. The protected ecosystem routes plus the public, private
and Telegram identity boundaries are the first four extracted server domain
slices.

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

The second slice exposes `server/modules/publicProfile/public.ts` as the only
entry to public-profile identity and persistence. It owns numeric and legacy ID
validation, the additive SQLite migration, canonical ID resolution, the
privacy-safe lookup and serializer, and the compatible Express route. The
composition root now only supplies its database handle and mounts the router;
URLs, SQL conditions, cache headers, generic errors and the four-field response
remain unchanged. Its size ceiling is ratcheted from 9,953 to 9,915 lines.

The third slice exposes `server/modules/identity/public.ts` as the private
browser-session and account-profile boundary. It owns the three compatible
HTTP routes and bounded profile-patch validation, while the composition root
supplies session, persistence, serialization, role, token, cookie and cache
capabilities. Route URLs, status codes, JSON bodies, serializer allowlist,
session refresh, cookie clearing and middleware order remain unchanged. The
legacy route owner is deleted and the server composition-root ceiling is
ratcheted from 9,915 to 9,914 lines.

The fourth slice exposes `server/modules/telegramAuth/public.ts` as the verified
Telegram account-resolution boundary. It strictly parses decimal Telegram IDs
and fixed-issuer OIDC subjects, treats username and profile fields only as
mutable display metadata, rejects cross-owner and second-provider conflicts,
and claims all normalized identities inside the auth-store transaction. Legacy
widget completion consumes a short-lived signed browser intent. Explicit OIDC
and bot linking start through CSRF-protected endpoints, bind to the initiating
user and exact session, and revalidate that session inside the final database
transaction. Bot codes carry 144 bits of entropy and are consumed atomically
with their identity claim. Arena treats the KHA profile store as read-only, so
the KHA bot remains its single writer and owns verified-email challenges. The
client actions live in a separate 3.66 kB lazy chunk, expose loading/error/
already-linked states and report only the privacy-safe `telegramLinked` flag.
The production auth, OIDC and legacy-intent cookies use `__Host-` scope. The
server composition-root ceiling is ratcheted from 9,914 to 9,756 lines and the
identity login-panel ceiling from 1,098 to 1,071 lines. The small server
increase from the first cut includes fail-fast partial credential validation;
the final slice still removes 158 lines from the preceding server ceiling.

Before this slice can be released, the coordinated KHA bot must accept the
exact case-sensitive strong-code format, persist its email-verification attempt
budget and pass its focused tests. The implemented Limburg real-IP trust-list
change in the versioned Nginx contract must also pass release verification
before this branch is integrated, so EU visitors keep independent rate-limit
identities.
The release deliberately invalidates legacy short link codes and the old
production auth-cookie name; existing users sign in once again instead of
accepting an unsafe sibling-domain cookie migration.

### 6. Application shell

Status: in progress. Routing and navigation are implemented in review; shell
decomposition remains planned.

- [x] Move route metadata, loaders and preload policy into the application route
  manifest.
- [x] Move URL settlement, history and page metadata orchestration into focused
  application routing files.
- [ ] Move authentication lifecycle into `app/providers/AuthProvider.tsx` and a
  small public hook; keep identity policy in the identity module.
- [ ] Move subscription lifecycle into an application provider that consumes
  the subscriptions module public contract.
- [ ] Extract desktop/mobile navigation, global header, footer and route fallback
  into `app/shell` without importing domain internals.
- [ ] Add an application-level error boundary and explicit lazy-route recovery.
- [ ] Remove duplicated Arena data types after their route modules own them.

Complete when `App.tsx` is below 500 lines and contains only providers, shell
composition and route-view selection. All 48 public URL policies, responsive
navigation, entitlements and Back/Forward scenarios must remain compatible.

### 7. Identity and subscriptions

Depends on the application routing foundation and proceeds alongside the shell
provider extraction.

Status: in progress. The client subscription contract, shared presentation
metadata, login, public-profile client/server identity boundaries,
private-account and guest-auth transport, application authorization and
Telegram provider linking are complete; a shared client identity provider and
subscription extraction remain.

1. [x] Create `client.subscriptions` as the runtime-neutral owner of the client
   status DTO, all seven entitlement keys and named-entitlement access policy.
   Migrate application routing, subscription-aware headers and legacy feature
   composition to its public entry without making client state an authorization
   boundary.
2. [x] Centralize the ordered Russian entitlement labels and legacy
   `Все разделы` fallback in a directly tested presentation model. Migrate the
   account and administrator consumers without changing visible output.
3. [x] Create `client.identity`, move the login/profile panel and its 151-rule
   authenticated presentation out of `DeferredRoutes`, and make both
   `accountRoute` and `applicationConnect` consume one public lazy loader. Login
   intent now preloads identity rather than the articles/tier-list bundle.
   `DeferredRoutes.tsx` is ratcheted from 4,416 to 3,226 lines, its route JS from
   108.4 kB to 78 kB, and its route-owner CSS from 52.1 kB to 31.3 kB. The
   mechanically extracted 1,196-line `LoginPanel.tsx` is a temporary migration
   ceiling; the next identity slices separate provider linking, auth lifecycle
   orchestration and the guest/authenticated views.
4. [x] Move the public profile, profile hero and avatar into identity; expose
   the route only through a lazy public loader and the eager avatar styles only
   through the checked `public.css`. The numeric and bounded legacy profile-path
   parser now shares the identity model with the canonical URL builder, so the
   shell and route manifest cannot accept IDs that identity would refuse to
   generate. Keep Application Connect in its own module consuming the identity
   public contract. Public profile JS/CSS and the shared hero now have explicit
   build budgets, while module-to-legacy debt is ratcheted from seven to five.
   The literal profile loader plus the stricter shared route parser add a
   measured 451 raw / 202 gzip bytes to startup; that exact cost is ratcheted,
   while the profile implementation, hero and route CSS remain lazy.
5. [x] Move the current-session DTO, allowlisted JSON validation and private
   account requests into identity `model` and `api` owners. The application
   shell now consumes the public session API with the same three-attempt retry
   and abort policy; `LoginPanel` delegates profile updates and best-effort
   logout without changing request bodies, headers, messages or local UI
   transitions. Truthy non-boolean permission values and malformed success
   payloads are rejected, while unknown response fields cannot cross the
   browser identity contract. The shell and panel line ceilings are ratcheted
   from 1,753 to 1,698 and from 1,196 to 1,191 respectively.
   Fail-closed session parsing adds a measured 1,404 raw / 435 gzip startup
   bytes; lazy profile-response validation adds 568 raw / 244 gzip bytes to the
   account route. These exact costs are ratcheted while mutations remain out of
   the initial graph and login/public-profile chunks stay independent.
   The follow-up identity slice moves password login, registration, reset and
   email verification transport behind a private `api/guestAuthApi.ts` owner,
   reuses one fail-closed `AuthUser` response parser and centralizes admin and
   contest UI policy on validated server permission flags. Legacy role/ID UI
   bypasses and the duplicate contest `AuthUser` declaration are removed. This
   lowers `LoginPanel.tsx`, `Contests.tsx` and `App.tsx` ceilings to 1,172,
   1,700 and 1,690 lines. The shared policy adds a measured 354 raw / 92 gzip
   startup bytes; strict guest-auth parsing adds 260 raw bytes only to the lazy
   account route. Provider linking and subscription parsing remain the next
   isolated boundary.
6. [x] Put public-profile ID policy, SQLite persistence, serialization and HTTP
   routing behind `server.publicProfile/public.ts`; keep application device
   authorization behind the existing `server.applicationAuth/public.ts`.
7. [x] Extract browser session and private account-profile routes behind
   `server.identity/public.ts`. Preserve the three URLs, exact status and JSON
   contracts, private-cache policy, serializer allowlist, session refresh,
   logout cookie clearing and the rate-limit/CSRF/body-parser ordering.
8. [x] Extract immutable Telegram resolution, intent policy and transactional
   claims behind `server.telegramAuth/public.ts`; keep client transport in
   `identity/api`, orchestration in `identity/hooks` and accessible linking UI
   in its own lazy chunk. Link OIDC and bot credentials to the initiating
   session, make KHA profiles read-only in Arena and coordinate the strong-code
   contract with the KHA bot. The module owns its database bootstrap audit and
   partial uniqueness constraint; the release contract owns the complete
   origin proxy trust list, including the European edge.
9. [ ] Extract subscription confirmation, entitlement and provider synchronization
   into a separate subscription module.

Complete when `/connect`, `/id/:id`, legacy profile URLs and `?login` behave
unchanged; private responses remain `private, no-store`; account/connect no
longer import legacy features; and identity/subscription permissions have direct
contract tests.

### 8. Standard Meta and decks

Status: planned as a sequence of `ROUTES-01` slices.

Split the current mixed Standard surface by user capability:

1. standard matchups;
2. meta list, filters and archetype summaries;
3. archetype detail, matchup and history views;
4. Vicious Gold and fun decks;
5. deck preview/list and deck builder.

Move pure filter and route models first, then API clients, controllers and UI.
Deck-preview DTOs belong to a domain model rather than a list component. The
legacy `/standard/meta/{format}/{slug}` detail URL remains self-canonical and
must not become an implicit redirect.

Complete when each surface has a focused lazy entry and chunk budget, the
HsReplay type cycle is removed, server public API uses module contracts, and
the legacy detail URL has an explicit regression test.

### 9. Editorial, community and smaller domains

Status: in progress. Gallery and developer API have focused owners; the
remaining legacy route exports are planned.

Finish low-coupling domains as independent slices:

- articles and article administration -> `editorial`;
- guides archive and FAQ -> their owning editorial/help contracts;
- gallery and cosmetics -> dedicated public entries;
- contests -> `community`, with contest administration exposed separately;
- developer API documentation -> `developerApi`.

Each slice owns route, model, API and UI only when those layers exist. A small
static page does not need artificial service or repository directories.

Complete when the remaining `DeferredRoutes.tsx` exports are gone, its file can
be deleted, and every resulting route has a measured cold and repeated load.

### 10. Administrator workspace

Status: in progress. The `client.adminWorkspace` shell is integrated; product
domain migrations remain planned.

The TailAdmin-inspired workspace owns layout, navigation, responsive drawer,
accessibility and shared error surfaces. Product pages remain with their domains:

- Arena operations -> `arena/admin`;
- articles and gallery -> `editorial/admin`;
- users -> `identity/admin`;
- subscriptions and provider synchronization -> `subscriptions/admin`;
- parser control -> `dataOperations`;
- mailing -> `communications`;
- contests -> `community/admin`.

`src/app` composes an admin route manifest and supplies lazy pages to the shell;
the shell must not eagerly import every product module. Each significant state
gets a Storybook story and an explicit permission-matrix test.

Move one admin capability per M-sized slice, in this order:

1. Checked admin page manifest and RBAC matrix, including contest-only access,
   unauthorized deep links and a stable page title/breadcrumb contract.
2. Content operations: articles, gallery, translations and mechanics, each
   with list, search/filter, edit, saved, invalid, failed and retry states.
3. Data operations: parser control, Arena refresh, Standard operations and
   public API, including data age, job progress, cancellation and recovery.
4. Audience operations: users, Telegram, Boosty, subscriptions and mailing,
   with explicit private-data fields and audit events.
5. Growth operations: contests, referrals and analytics, keeping product
   policy in `community/admin` rather than the workspace shell.

Every mutation slice specifies confirmation/cancellation, duplicate-submit
protection, success/failure recovery and the audit record. Every page must keep
filter/query state on Back/Forward, expose loading/empty/error/retry states,
work with the mobile drawer and remain outside the public startup bundle.

Complete when TailAdmin remains a replaceable presentation boundary, no domain
logic lives in the workspace shell, no consumer imports internal workspace CSS,
and the admin JS/CSS budgets remain ratcheted. The final evidence is the RBAC
matrix, desktop/mobile/200% browser matrix, mutation audit contract and per-page
lazy bundle report.

### 11. Final server composition-root cleanup

Status: in progress through each `SERVER-01` extraction.

This phase depends on the route-family extractions in Phase 5. It advances by
lowering the root ratchet with every completed server domain and finishes after
the client domain phases. The final `server/index.ts` only:

1. reads validated configuration;
2. creates infrastructure dependencies;
3. calls `createApp`;
4. starts the listener and shutdown lifecycle.

Move route families into `server/modules/<domain>`, generic middleware and
infrastructure into `server/app` or `server/shared`, and pass database, cache,
clock, fetch and provider clients explicitly. Telegram resolution and
persistence policy are extracted; its Express/OIDC transport adapter still
needs a small route owner after the security cutover stabilizes. Email and
subscription confirmation remain the next high-risk inline boundary.

Complete when `server/index.ts` is below 500 lines, the server root contains
only genuine entry points, services do not depend on Express globals, and
startup, shutdown, recovery, authorization and endpoint latency are verified.

### 12. Shared contracts and cycle removal

Status: in progress; remaining crossings and type-inclusive cycles are checked
architecture debt.

Create `shared/contracts/<domain>` only for runtime-neutral types, schemas and
serialized envelopes used by both client and server. React, Express, filesystem
access, transport clients and orchestration are forbidden there.

Prioritize Standard Meta datasets, related-card contracts and other current
client/server crossings. Every move requires an ADR if it establishes a new
shared ownership rule. Do not move a symbol merely because two files import it;
its vocabulary and tests must make sense without either runtime.

Complete when client/server runtime crossings are zero, all type-inclusive
cycles are removed, and `shared` has no dependency on an application or product
module.

### 13. UI system and visual quality

Status: in progress as a parallel P1 lane. Visual quality ships inside every
domain slice rather than waiting for a final global rewrite.

First create a generated review matrix that maps all 25 application surfaces
and 48 URL policies to a product owner, page template and priority:

- Tier A: primary discovery, cards, filters, Battlegrounds, identity and
  administrator tasks; full state, accessibility, screenshot and performance
  coverage is mandatory;
- Tier B: secondary editorial, community and detail flows; state,
  accessibility and representative screenshot coverage is mandatory;
- Tier C: aliases, redirects, removed pages and policy-only URLs; URL,
  canonical, recovery and not-found behavior is mandatory.

Improve visual consistency as domain files move:

- keep one documented token source for color, spacing, type, elevation and
  motion;
- promote only proven generic primitives such as modal surfaces, focus
  management and error recovery into `shared/ui`;
- keep `AuthAvatar` and profile UI in identity, paywall UI in subscriptions and
  card presentation in its card domain;
- colocate CSS and Storybook states with the owning UI;
- meet WCAG 2.2 AA for keyboard, focus, labels, contrast, reflow and reduced
  motion;
- test loading, skeleton, empty, partial, failure, retry and slow-network states
  at 320×568, 390×844, 768×1024, compact desktop and desktop viewports;
- save labelled before/after screenshots and the changed task's interaction
  checklist with the release evidence.

The current browser QA produces the representative responsive screenshot and
accessibility matrix. A separate M-sized tooling slice must add deterministic
baseline storage, pixel-diff thresholds and a review/update command before
`visual-regression coverage` becomes a blocking CI claim. Until then, reviewers
compare the saved before/after artifacts and Storybook states explicitly.

Complete when `src/components` contains only genuine shared primitives or is
gone, cross-domain private CSS imports are zero, visual-regression coverage
is reproducible for Tier A surfaces, key tasks require no undocumented gesture,
and accessibility checks pass.

### 14. Images, CDN and regional delivery

Status: in progress. Card images have the complete local-first Timeweb path;
the broader public-static plane is a canary and must advance by resource class.

Keep delivery policy separate from card business logic. The current coverage
and intended boundary are:

<!-- markdownlint-disable MD013 -->

| Resource class | Current browser route | Current/target delivery | Cache and credential boundary |
| --- | --- | --- | --- |
| Versioned card images `/api/card-image/**` | `cdn.arena.hs-manacost.ru` when the runtime switch is enabled | regional local mirror → Timeweb on miss → edge retry to origin | `GET`/`HEAD`, long public TTL; no cookies or authorization |
| Hashed JS/CSS, fonts and release media | application host; CDN allowlist is canary-only | synchronized regional release → credential-stripped origin fallback, then class-by-class URL activation | one year `immutable`; release checksum must match |
| Other public media `/api/public-resource/**` | application host | remain same-origin until inventoried, then regional canary with bounded upstream fallback | response-driven bounded TTL; no credential forwarding |
| Mutable public JSON, icons, robots and sitemaps | application host | origin or short regional revalidation only | never inherit a provider-wide immutable/browser TTL |
| HTML and `/runtime-config.js` | application host through regional reverse proxies | origin-backed dynamic plane | runtime `no-store`; no shared cache |
| Auth, subscriptions, profiles, admin and private/personalized API | application host through trusted regional proxies | origin-backed dynamic plane only | `private, no-store`; never Timeweb or shared Nginx cache |

<!-- markdownlint-enable MD013 -->

After those server-side levels fail, the browser image component has a separate
final `onError` retry against the same-origin application URL. It is not part of
the regional edge's upstream chain.

One documented public-resource contract owns same-origin URL generation;
`tile`, `detail` and `original` variants; format negotiation without reducing
the requested quality class; ETag/versioned cache behavior; purge and rollback;
and the client fallback. The Timeweb configuration and edge implementation must
continue following the two delivery specifications and two rollout runbooks in
the source-of-truth table rather than duplicating mutable provider settings here.

`PERF-01` establishes explicit p50/p95 byte budgets for `tile`, `detail` and
`original`, the maximum visible/prefetch request concurrency and the allowed
above-the-fold queue delay. Tile bytes may decrease; detail dimensions and
visual quality must stay within the recorded contract, and original downloads
remain byte-identical. No image optimization ships before these values and a
representative visual comparison are saved.

Every canary compares cold and warm page, filter and image loads from Russia
(Moscow and Novosibirsk), Europe (Limburg IPv4 and IPv6), North America, Asia
and direct origin. A North American or Asian result must come from a controlled
probe in that region. Record DNS, connect, TLS, TTFB, total time, bytes, status,
cache state, serving edge and release SHA. Initial gates are cache-hit ratio at
least 95% after warm-up, cached static TTFB p95 at most 250 ms, static
availability at least 99.9%, and CWV p75 of LCP at most 2.5 s, INP at most
200 ms and CLS at most 0.1.

Complete when every resource class has a declared route and rollback, all
public images use one tested quality policy, no background request competes
with visible images, regional/fallback probes pass, and no credential-bearing
request or private response reaches the CDN host. Required local gates include
`test:cdn-delivery`, `test:network-boundary`, `test:runtime-client-config`,
`test:production-monitor`, browser QA and the saved regional report. ADR-008
and ADR-009 remain the governing delivery decisions.

### 14.1 Observability and recovery gate

`OBS-01` turns measurements into an operated contract. The `web-platform`
owner publishes a versioned dashboard and alert/runbook links for:

- p75 CWV and crash-free sessions by bounded client/edge region, device and
  release;
- request rate, 5xx rate and p95/p99 duration by bounded route template;
- CDN local/upstream hit, miss and origin-fallback rate by resource class and
  region;
- dataset age/version/mode/rejection reason and Battlegrounds roster patch age;
- deploy annotations, active release parity and synthetic recovery events.

Initial operational gates reuse the stability and regional specifications:
public shell/core API availability at least 99.9%, core-route 5xx below 0.5%,
cache-hit API p95 at most 500 ms, critical uncached/data endpoint p95 at most
1.5 s, automated regression detection within five minutes, and critical data
freshness within its schedule plus 30 minutes. Dataset-specific completeness
thresholds remain versioned per source; one arbitrary threshold must not be
reused across Arena, Standard and Battlegrounds.

Every pageable alert names its owner, impact, dashboard, first three checks and
rollback/fallback. A synthetic monitor runs from outside the origin at least
every five minutes, pages only after two consecutive failures, emits recovery
and is exercised before the gate is declared integrated. Raw IPs, user ids,
cookies, query values and card ids never become metric dimensions.

### 15. AI tooling and final legacy removal

Status: in progress. Ownership/navigation and the completed `ARCH-01`
implementation are in review; per-owner `LEGACY-01` slices remain.

The generated `agent:context`, `agent:check`, `agent:impact` and `agent:map`
commands now cover canonical modules, eight initial migration areas, all 48
public URL policies and the repository root. The checked baseline covers
product code in `src`, `server`, top-level `shared`, and
`public/bg-legacy`; new orphaned or overlapping legacy files fail CI.

Canonical `src/shared` and `server/shared` roots now have first-class ids,
owners, purposes, tests, documentation and safe starts. They are selectable by
id or nested path; their check plan deliberately retains the conservative
same-runtime module and migration-area set because a cross-module primitive has
a wider blast radius than its own focused contract tests.

The boundary checker is now characterized and decomposed behind its existing
three public exports. Diagnostic safety, repository paths, canonical contracts,
inventory validation, exception policy, edge identity, source scans, import
parsing and resolution, cycle analysis and report formatting have named
`scripts/lib/` owners. The facade retains analysis order, edge policy and CLI
orchestration and is 284 lines against an exact 284-line ratchet. Exact tests pin
diagnostic order, report bytes, stdout/stderr and exit codes; the former
1,000-line characterization file is split into six responsibility suites, and
an AST-based gate enforces strict downward dependencies across governed library
layers, requires every classified unit to remain reachable from the facade and
rejects dynamic, CommonJS, peer-relative and import-map bypasses.

The migration is complete when:

- missing public entries, internal imports, module-to-legacy imports and runtime
  crossings are all zero;
- runtime and type-inclusive cycles are zero;
- no unregistered product code remains in `src/features` or the server root;
- all 48 public URL policies have an explicit surface/module owner or documented
  non-surface reason;
- `App.tsx` and `server/index.ts` are below 500 lines;
- route adapters are below 300 lines, models/services/repositories below 250
  lines and views below 500 lines;
- every supported test is registered exactly once;
- production build, budgets, Storybook, architecture checks, security scans and
  browser QA pass from a clean checkout.

## Definition of done for every slice

- The slice has one named owner and, when it changes a product module, one
  public entry point. Shared roots and repository tooling retain their explicit
  non-module contracts instead of inventing a module entry.
- Dependencies follow the `app -> modules -> shared` contract and no other
  module imports its internals.
- Existing public URLs, response shapes and permissions remain compatible.
- Pure behavior is tested without rendering the whole application.
- React changes pass React Doctor; authored JavaScript and TypeScript changes
  pass the scoped Semgrep gate.
- Security-sensitive changes pass Gitleaks; dependency changes pass the
  dependency/OSV/Trivy gates. Identity and admin changes update their threat
  model and permission tests; CDN/proxy changes prove cache and credential
  boundaries.
- Type checking, focused tests, production build and budgets pass.
- Browser checks cover the changed route, desktop/mobile/200% reflow, keyboard,
  required UI states, console and relevant network waterfall.
- The task resolves its declared `Documentation impact`; code and its owning
  architecture, specification, decision, runbook or changelog stay consistent.
- The line and bundle budgets are lowered when a hotspot becomes smaller.
- Changed operational behavior has an owned metric/alert, recovery path and
  saved verification evidence; absence of telemetry is an explicit decision.

## Performance measurement

Use the same before-and-after path for every optimization:

- record production TTFB and response size for affected API requests, with p75,
  p95 and sample count where traffic data exists;
- record built raw and gzip chunk sizes;
- test cold navigation and a repeated navigation;
- test filter input and mode switches for interaction latency;
- observe LCP, INP and CLS in a real browser;
- verify slow-network behavior without background requests competing with
  above-the-fold images;
- for delivery changes, compare RU, EU, North America, Asia and origin and save
  cache state, edge, bytes, timings and release SHA.

Optimizations without a baseline or a regression check are incomplete.
