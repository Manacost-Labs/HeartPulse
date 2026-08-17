# Module boundaries

## Purpose

This document is the architectural contract for new code and incremental
refactoring in HS-Arena. It defines ownership and dependency direction so the
application can be changed without first understanding a multi-thousand-line
file.

The migration is incremental. Existing routes and APIs stay available while
one independently deployable vertical slice at a time moves behind a focused
module boundary.

The decision and its trade-offs are recorded in
[`docs/decisions/002-domain-modules-and-documentation-contract.md`](../decisions/002-domain-modules-and-documentation-contract.md).

## Core principles

1. Organize business behavior by domain, not only by technical file type.
2. Give every domain one owner and a narrow public contract.
3. Keep dependency direction one-way: `app -> modules -> shared`.
4. Separate orchestration, domain policy, external data and presentation.
5. Extract a complete vertical slice instead of moving unrelated helpers.
6. Preserve public URLs, API shapes, permissions and observable behavior during
   a structural migration.
7. Prefer explicit duplication inside two domains over premature shared code.
   Promote code to `shared` only after its domain-independent contract is clear.

## Target client structure

```text
src/
  app/
    providers/
    routing/
    shell/
  modules/
    <domain>/
      routes/
      model/
      api/
      hooks/
      ui/
      public.ts
      public.css  # optional eager style contract
  shared/
    api/
    config/
    lib/
    ui/
```

The folders are responsibilities, not a requirement to create empty
directories. A small module may need only `model/`, `ui/` and `public.ts`.
`public.css` exists only when application composition must load an eager style
contract without importing a module's private UI stylesheet.

### `src/app`

Owns application composition:

- providers and application-wide lifecycle;
- the route manifest and lazy route selection;
- shell layout and application-level error boundaries;
- wiring modules to platform dependencies.

It must not own card, deck, account, subscription or Battlegrounds policy.

### `src/modules/<domain>`

Owns one coherent user or business capability. Examples include constructed
cards, Battlegrounds, decks, profiles, subscriptions and editorial content.

- `routes/` composes a route from module parts and translates route parameters.
- `model/` contains pure types, validation, transformations and policy.
- `api/` owns requests, response validation, cache keys and transport errors.
- `hooks/` owns browser state and asynchronous UI orchestration.
- `ui/` renders typed data and emits user intent.
- `public.ts` exposes the smallest stable contract needed outside the module.
- `public.css`, when declared, is the only supported cross-boundary stylesheet
  entry and delegates to module-owned CSS.

Other modules must not import an internal path such as
`modules/cards/model/privatePolicy`. They use the narrow public contract. Avoid
an application-wide barrel that eagerly imports every domain or hides bundle
ownership.

### `src/shared`

Contains domain-independent platform capabilities:

- HTTP primitives and typed transport errors;
- generic accessible UI primitives;
- environment and runtime configuration;
- small language-level helpers with no feature ownership.

`shared` is not a dumping ground. Do not create catch-all `utils`, `common`,
`helpers` or `misc` modules. A candidate belongs in `shared` only when its name,
tests and contract make sense without referring to one product domain.

## Target server structure

```text
server/
  app/
    createApp.ts
    middleware/
    registerRoutes.ts
  modules/
    <domain>/
      routes/
      service/
      repository/
      model/
      schema/
      public.ts
  shared/
    auth/
    cache/
    db/
    http/
    observability/
```

### `server/app`

Is the composition root. It creates infrastructure, registers middleware and
routers, and supplies dependencies. It does not implement domain decisions or
database queries.

### `server/modules/<domain>`

- `routes/` validates the HTTP boundary, applies authorization and serializes
  the response.
- `service/` implements use cases and domain orchestration without Express
  globals.
- `repository/` owns persistence and upstream-provider access.
- `model/` owns pure domain types and policy.
- `schema/` owns request, response and external-data validation.
- `public.ts` declares the route registration or service contract used by the
  composition root.

Dependencies such as databases, clocks, caches and provider clients are
received explicitly. Domain services must not reach into process-wide mutable
state when an explicit dependency can describe the contract.

## Dependency rules

Source imports follow these boundaries:

| Source | May import |
| --- | --- |
| `app` composition | a module's `public.ts`, declared `public.css`, `shared` |
| Module route | its hooks/services, adapters, UI and model |
| Module hook or service | its model and explicit ports |
| Module API or repository adapter | its model/schema and `shared` |
| Module UI | its model and `shared/ui` |
| Module model | other files in the same pure model |
| `shared` | other focused `shared` primitives |

Runtime calls may flow through an injected port to an adapter, but the pure
model does not import that adapter. Module composition selects the concrete
implementation.

The following rules are mandatory:

- Models do not import React, Express, DOM globals, routers or network clients.
- Views do not call raw `fetch`, databases or provider SDKs.
- Routes translate boundaries and compose behavior; they do not accumulate
  business policy.
- API clients and repositories validate untrusted external data before domain
  logic consumes it.
- Cross-module calls go through a documented public contract.
- Circular imports and domain-to-`app` imports are forbidden.
- A module may depend on `shared`; `shared` may not depend on a product module.
- Authorization remains visible at the server route or use-case boundary.

## Machine-enforced inventory

[`config/module-boundaries.json`](../../config/module-boundaries.json) is the
checked source of truth for current module ownership. Every immediate directory
under `src/modules` and `server/modules` must have exactly one inventory entry
with a stable id, runtime, purpose, owner, public entry, optional client
`publicStyleEntry`, declared module dependencies, focused tests and owning
documentation.

`npm run agent:map` renders that ownership inventory together with the checked
reverse dependency callers from the resolved import graph. It also renders the
48 canonical public URL policies from their existing SEO inventory as a
separate section; route-team labels are not guessed to be module ids. Use
`npm run --silent agent:map -- --json` for deterministic machine-readable
output without npm's human-oriented command banner. The JSON has no timestamp
or absolute worktree path, so equal repository state produces equal bytes.

`npm run lint:module-boundaries` resolves the TypeScript and JavaScript import
graph with the project compiler configuration. It covers static imports,
type-only imports and re-exports, literal dynamic imports, `require`,
import-equals declarations, import types and declaration files, path aliases,
static `import.meta.glob` patterns, bundler query suffixes, `.js` specifiers that
resolve to TypeScript, and stylesheet `@import`, `@use` and `@forward` edges.
Repository-local package installations are excluded by path segment, so the
same graph is produced whether `node_modules` is a directory or an external
worktree symlink. Non-literal dynamic imports and globs, or a missing/invalid
TypeScript project configuration, fail closed instead of silently omitting an
edge.
The check rejects:

- an unregistered module directory or stale inventory entry;
- access to another module anywhere except its declared `public.ts` or optional
  `public.css` stylesheet contract;
- an undeclared cross-module dependency or a new client/server source crossing;
- module imports back into legacy code except an exact migration exception;
- shared code importing application or product-module code;
- every runtime import cycle;
- stale, duplicated, unsafe or expired migration exceptions.

The current migration baseline scans 456 source files and contains fourteen
modules, no missing public entries, no outside-to-internal imports, five
module-to-legacy imports, four type-inclusive cycles, two legacy client/server
source crossings and zero runtime cycles. The Arena, constructed-card,
Battlegrounds public-API and admin-workspace consumers now enter their modules
only through configured public entries. The graph contains 774 resolved edges.
The client subscription status, entitlement policy and ordered display labels
now have one
runtime-neutral owner under `src/modules/subscriptions`; application and legacy
route composition consume its public entry instead of maintaining duplicate
access models or presentation metadata.
The `client.identity` module now owns the canonical account-surface browser
user contract, its allowlisted runtime parser, guest login/register/reset/
verification transport, private session/profile/logout transport, validated
admin and contest UI policy, public-profile path builder and route parser, API model,
`AuthAvatar`, the shared profile hero, the public-profile route and separate
lazy login/profile loaders. Session verification keeps its bounded retry and
abort behavior; profile updates keep the CSRF request marker; logout remains a
best-effort request so the local interface clears immediately. The application
shell and login/profile UI no longer parse JSON or own endpoint literals for
session, profile and guest-auth operations. The validated session reader adds a
measured 1,404 raw / 435 gzip bytes to the startup shell; profile validation
stays in the lazy account route and adds 568 raw / 244 gzip bytes there. Guest
transport plus the shared permission policy add another measured 354 raw / 92
gzip startup bytes and 260 raw bytes to the lazy account route. These values are
exact build ratchets, and the login and public-profile chunks remain independent.
Account routing and Application Connect consume that contract through
`identity/public.ts`, while the eager avatar styling enters through the checked
`identity/public.css`. Login and `/id/:id` remain independent route chunks and
neither downloads the other surface. Identity has no migration exceptions.
The domain-independent document URL policy and its machine-readable route
inventory live together under `src/shared/seo`, so shared code has no backward
dependency on application configuration.
The `server.publicProfile` module now owns numeric and compatible legacy ID
validation, the additive SQLite migration, public lookup, the four-field
privacy allowlist and `GET /profiles/:publicProfileId`. The server composition
root reaches those capabilities only through `public.ts`; no duplicate profile
owner or module exception remains.
The `server.identity` module owns `GET /api/auth/me`,
`PATCH /api/auth/profile` and `POST /api/auth/logout`, including the bounded
profile-patch parser and their exact transport and error policy. The server
composition root injects session lookup and refresh, persistence, the
privacy-safe serializer, role checks, token revocation, cookie clearing and
private-cache policy through `public.ts`. API rate limiting, the cookie-mutation
CSRF guard and route-aware JSON parsing remain ahead of the module mount, and
the legacy route owner has been removed.
The `server.telegramAuth` module owns strict verified-claim parsing, immutable
Telegram ID and fixed-issuer OIDC subject resolution, KHA verified-email
reconciliation, one-time legacy sign-in intent policy, transactional identity
claiming, session-bound OIDC linking and atomic bot link-token consumption.
Mutable username, name and photo fields are display metadata only. The KHA
profile file is a read-only verified-email and subscription snapshot here; the
KHA bot is its sole writer. The composition root supplies provider verification,
database/profile adapters, hashing, randomness, clocks, session creation and
HTTP redirects through `telegramAuth/public.ts`. Normal callbacks are sign-in
operations. Explicit OIDC and bot linking require a CSRF-protected start, bind
to the exact initiating session and recheck that session inside the final
transaction before any user, session, token or identity mutation commits.
The application routing foundation now lives under `src/app/routing`: its
manifest owns surface metadata and literal loaders, while pure route resolution
and browser navigation orchestration have focused owners. Each remaining
exception names its exact source, target and import kind together with an owner,
reason and expiry. The budget equals the number of exact exceptions, so removing
debt requires deleting the stale exception and lowering the budget in the same change.
Exceptions may not expire more than 180 days after the check date, and source
or ownership-artifact symlinks fail closed. There is no automatic
baseline-update mode.

## File and change budgets

The CI ratchet in `scripts/check-module-size-budgets.mjs` prevents known
hotspots from growing. It is a migration ceiling, not permission to create new
large files.

Targets for extracted code are:

| Responsibility | Target |
| --- | ---: |
| Route entry or HTTP route adapter | below 300 lines |
| Model, API client, repository or service | below 250 lines |
| View component | below 500 lines |
| Application or server composition root | below 500 lines |

An exception requires a written reason in the task and the closest
architecture document. New behavior must not increase a ratcheted hotspot:
extract its owning slice first.

Keep a structural change independently reviewable:

- one domain slice per task;
- aim for no more than five authored files when practical;
- separate behavior changes from structural moves;
- lower the hotspot budget in the same change after an extraction;
- delete the old path only after callers and tests use the new boundary.

## Documentation contract

Documentation is part of the implementation, not follow-up work. Every task
states `Documentation impact` before editing: either the exact documents that
must change or `none` with a concrete reason.

Use the owning document:

| Change | Required home |
| --- | --- |
| Module ownership, dependencies or application shape | `docs/architecture/` |
| Expensive or hard-to-reverse engineering decision | `docs/decisions/` |
| Public behavior, API, data or permission contract | `docs/specs/` |
| Environment, cache, deploy, monitor or recovery procedure | `docs/runbooks/` |
| User-visible or maintainer-visible shipped change | `CHANGELOG.md` |

Inline documentation has a different purpose:

- comment why a constraint exists, not what the next line does;
- record invariants, compatibility requirements and non-obvious security or
  performance trade-offs beside the code they constrain;
- add concise JSDoc to exported contracts when semantics, errors, side effects
  or ownership are not clear from the signature;
- do not preserve commented-out code or narrate obvious control flow.

Documentation and source changes ship in the same task and commit. A pure
internal refactor may need no new document, but the task must name the documents
reviewed and explain why their contracts remain accurate.

## Incremental migration workflow

For each hotspot:

1. Name the domain behavior and its current callers.
2. Record the current URL, API, permission, test and performance contracts.
3. Choose one narrow vertical slice and its public entry point.
4. Extract pure model behavior and cover it directly.
5. Move I/O behind an API client or repository boundary.
6. Reduce the original file to composition and delegation.
7. Verify compatibility, build output and relevant browser or endpoint signals.
8. Lower the line or bundle ratchet and update the owning documentation.

Do not begin with a shared abstraction. Begin with domain ownership; extract a
shared primitive only when multiple completed slices prove the same stable
contract.

## Definition of done for a module slice

- The domain and its public entry point are named.
- Dependencies follow `app -> modules -> shared`.
- Boundary data is validated and errors are explicit.
- Pure policy is directly testable without rendering the whole application or
  starting the full server.
- Public URLs, response shapes and permissions remain compatible unless a
  separately approved specification changes them.
- The original hotspot is smaller and its ratchet is lowered.
- There is no new catch-all helper folder or eager mega-barrel.
- `Documentation impact` is resolved; source, tests and docs agree.
- Focused tests, type checking, architecture lint and the production build pass.
- Runtime-visible changes receive the required browser or endpoint review.
