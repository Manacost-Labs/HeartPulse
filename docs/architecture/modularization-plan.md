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

The module inventory will evolve from a dependency gate into the checked map a
human or AI agent reads before editing. Each record should eventually contain:

- stable module id, purpose and owner;
- public client routes and server mounts;
- public entries and declared module dependencies;
- owned state stores, cache keys and external data sources;
- focused tests, browser scenarios, specifications and runbooks;
- safe starting files and exact temporary migration debt.

Generated commands should expose that map without duplicating it in prose:

- `agent:context -- <module-or-path>`: owner, purpose, public entry,
  dependencies, callers, tests, documents and known debt;
- `agent:check -- <module-id>`: focused type, test and boundary checks;
- `agent:impact -- <path>`: affected modules, routes, contracts and tests;
- `agent:map`: generated client/server dependency and route ownership map.

These commands are added only after their data can be derived from the checked
inventory. Hand-maintained parallel registries would make automated changes
less safe.

## Delivery roadmap and visible outcome

The roadmap is ordered by risk and user value. Every milestone must leave a
working release candidate; dates are assigned only after the preceding quality
gate is green.

| Priority | Milestone | Exit gate |
| --- | --- | --- |
| P0 | Checked ownership map | boundary graph green |
| P0 | Identity security cutover | coordinated release green |
| P1 | Application shell | shell below 500 lines |
| P1 | Cards and Battlegrounds | RU/EU performance green |
| P1 | Administrator workspace | access and UI matrix green |
| P2 | Standard, decks and editorial | legacy route bundle removed |
| P2 | Server domains | server root below 500 lines |
| P3 | Contracts and observability | zero crossings and cycles |
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

## Delivery order

Each numbered area is delivered as a sequence of small vertical slices, not as
one broad rewrite. A slice should normally change no more than five authored
files, keep the application deployable and lower the ratchet it replaces.

### 0. Safety guardrails

Status: implementation complete; awaiting integration.

- [x] Forward rejected Express 4 route promises in the extracted ecosystem and
  article-vote routes to the existing structured error middleware, with direct
  rejection-path tests. The remaining inline subscription confirmation route is
  closed by its planned module extraction rather than by adding logic to the
  server composition root.
- [x] Remove source blocks proven unreachable by TypeScript and dependency
  analysis. This deleted 1,949 lines of retired admin, deck and application
  code from `DeferredRoutes.tsx` and lowered its ratchet from 6,435 to 4,468
  lines without changing a public export.
- [x] Add a machine-readable inventory for all nine current modules and an
  AST-resolved dependency gate across TypeScript and JavaScript sources.
  Existing migration debt is represented only by exact, owned, expiring edges;
  the accepted graph has no runtime cycle.
- [x] Generate the test command from a checked registry so all 223 supported
  test files belong to exactly one runnable suite and suite-only environment
  variables cannot leak into the remaining tests. Discovery scans the authored
  repository tree and rejects test files outside `tests/`, preventing colocated
  or unregistered tests from being silently skipped.
- [x] Make CodeGraph and focused module context available from isolated
  worktrees through safe project commands that synchronize the selected index
  and expose the module contract before broad source reads.

These guardrails land before additional route extraction so every later slice
has a narrow verification command and cannot add new dependency debt.

### 0.1 Public module-entry debt

Status: implementation complete; awaiting integration after Phase 0.

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

Status: implementation complete; awaiting integration after Phase 0.1.

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

Status: complete.

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
- Keep only genuinely shared primitives in a small common module.
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

### 5. Server composition

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
budget and pass its focused tests. The Limburg edge must also be added to the
origin's trusted real-IP list so EU visitors do not share one rate-limit key.
The release deliberately invalidates legacy short link codes and the old
production auth-cookie name; existing users sign in once again instead of
accepting an unsafe sibling-domain cookie migration.

### 6. Application shell

Status: routing and navigation foundation complete; shell decomposition pending.

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

Status: client subscription contract, shared presentation metadata, login,
public-profile client/server identity boundaries, private-account and guest-auth
transport, application authorization and Telegram provider linking complete;
a shared client identity provider and subscription extraction remain.

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

The TailAdmin-based workspace owns layout, navigation, responsive drawer,
accessibility and error surfaces. Product pages remain with their domains:

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

Complete when TailAdmin remains a replaceable presentation boundary, no domain
logic lives in the workspace shell, no consumer imports internal workspace CSS,
and the admin JS/CSS budgets remain ratcheted.

### 11. Server composition root

This phase advances in parallel with every domain extraction and finishes after
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

Improve visual consistency as domain files move rather than through a global
rewrite:

- keep one documented token source for color, spacing, type, elevation and
  motion;
- promote only proven generic primitives such as modal surfaces, focus
  management and error recovery into `shared/ui`;
- keep `AuthAvatar` and profile UI in identity, paywall UI in subscriptions and
  card presentation in its card domain;
- colocate CSS and Storybook states with the owning UI;
- test keyboard, focus, reduced motion, empty, loading, error and slow-network
  states at the supported viewports.

Complete when `src/components` contains only genuine shared primitives or is
gone, cross-domain private CSS imports are zero, visual-regression coverage
exists for primary surfaces and accessibility checks pass.

### 14. Images, CDN and regional delivery

Keep delivery policy separate from card business logic. One documented public
resource contract owns:

- same-origin resource URL generation;
- `tile`, `detail` and `original` variants;
- image format negotiation without reducing the requested quality class;
- ETag, immutable/versioned cache rules and purge behavior;
- Timeweb CDN publication, Russian edge, European proxy and origin fallback;
- a strict ban on shared caching for authenticated HTML and private API data.

Complete when all public images use one testable policy, list tiles are light,
detail/original quality remains intact, cold and repeat loads are measured from
RU/EU/origin paths, fallback is exercised and private responses remain
credential-safe. ADR-008 and ADR-009 remain the governing delivery decisions.

### 15. AI tooling and final legacy removal

After the domain map is stable, add the generated `agent:context`,
`agent:check`, `agent:impact` and `agent:map` commands described above. Split
the boundary checker itself into parser, resolver, policy and report units only
after characterization tests pin its current behavior.

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
