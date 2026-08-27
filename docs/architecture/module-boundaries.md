# Module boundaries

## Purpose

This document is the architectural contract for new code and incremental
refactoring in HS-Arena. It defines ownership and dependency direction so the
application can be changed without first understanding a multi-thousand-line
file.

The migration is incremental. Existing routes and APIs stay available while
one independently deployable vertical slice at a time moves behind a focused
module boundary.

The checked inventory and owner lookup commands live in
[`module-catalog.md`](module-catalog.md). A new physical module is incomplete
until it has exactly one entry in `config/architecture-catalog.json`.

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
  shared/
    api/
    config/
    lib/
    ui/
```

The folders are responsibilities, not a requirement to create empty
directories. A small module may need only `model/`, `ui/` and `public.ts`.

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
| `app` composition | a module's `public.ts`, `shared` |
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

`npm run lint:architecture` analyzes the authored import graph and enforces
these rules. Runtime cycles are forbidden without exceptions. Any temporary
boundary violation or type-only cycle must exactly match
`config/architecture-debt.json` and include an owner, reason and removal
condition. New debt, drift and stale exceptions all fail the gate.

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

[`docs/README.md`](../README.md) defines the single purpose of every
documentation directory. New ADRs belong only in `docs/decisions/`.

Use the owning document:

| Change | Required home |
| --- | --- |
| Module ownership, dependencies or application shape | `docs/architecture/` |
| Expensive or hard-to-reverse engineering decision | `docs/decisions/` |
| Public behavior, API, data or permission contract | `docs/specs/` |
| Production topology or deployed state | `docs/operations/` |
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
