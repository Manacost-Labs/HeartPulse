# Legacy ownership catalog contract

## Status

Approved for the second architecture-quality increment on 2026-09-02.

## Objective

Extend the existing machine-readable architecture catalog so an AI agent can
resolve important legacy files and routes without pretending that a legacy
host file is already a domain module. The change improves navigation and
migration safety only; runtime behavior, public URLs and permissions remain
unchanged.

## Commands

```bash
npm run architecture:map
npm run architecture:impact -- server/index.ts
npm run architecture:owner -- FRONTEND /articles
npm run architecture:owner -- FRONTEND /heroes/123
npm run architecture:tests -- legacy-frontend-articles
npm run test:module -- legacy-frontend-articles
npm run test:architecture-catalog
npm run lint:architecture
npm run verify:release
```

## Project structure

- `config/architecture-catalog.json` remains the only machine-readable source
  for module and legacy ownership.
- `scripts/architecture-catalog.mjs` validates the contract and implements the
  existing lookup commands.
- `tests/architecture-catalog.test.mjs` proves validation and lookup behavior.
- `docs/architecture/module-catalog.md` explains the operational contract.
- `docs/architecture/ai-project-map.md` routes agents to the catalog.

No second ownership config or generated runtime file is introduced.

## Contract shape

The version 1 catalog gains an additive `legacyAreas` array. Existing `modules`
keep their current shape and semantics. A legacy entry reuses the existing
navigation fields and adds an explicit migration destination and exit
condition:

```json
{
  "name": "legacy-frontend-articles",
  "status": "legacy",
  "owner": "editorial",
  "purpose": "Own the public articles route while it is hosted in a monolith.",
  "paths": [],
  "publicEntrypoints": ["src/features/DeferredRoutes.tsx"],
  "frontendRoutes": ["/articles"],
  "backendRoutes": [],
  "contracts": [],
  "jobs": [],
  "cacheNamespaces": [],
  "dataStores": [],
  "externalServices": [],
  "tests": ["tests/routes.test.ts"],
  "allowedDependencies": ["legacy host dependencies during migration"],
  "forbiddenImports": ["new cross-domain dependencies"],
  "migrationTarget": "frontend-articles",
  "exitCriteria": "The route is served through a catalogued module public entrypoint."
}
```

### Physical host ownership versus route ownership

`paths` is exclusive physical ownership. Two entries may not own the same path
or nested path. File lookup uses only `paths`.

`publicEntrypoints` describes where behavior is currently exposed or hosted; it
is a reference and may be shared by multiple route-owned legacy entries. This
allows `/articles`, Battlegrounds data routes and Battlegrounds tool routes to
name their real product owners even while multiple exports share one monolith.

A legacy entry must own at least one file path, frontend route or backend route.
It must not exist only as prose.

## Validation behavior

Validation fails closed when:

- a module or legacy name is duplicated;
- a legacy entry does not use status `legacy`;
- its owner, purpose, migration target or exit criteria is empty;
- referenced paths, entrypoints, contracts, jobs or tests do not exist;
- required arrays are missing or contain duplicates;
- a legacy entry has no path or route surface;
- an exclusive path overlaps another module or legacy path;
- an exact frontend or backend route pattern has more than one owner.

An older version 1 in-memory fixture without `legacyAreas` remains valid for
backward compatibility. The repository catalog itself must declare the array.

## Lookup behavior

- `architecture:map` lists modules first and legacy areas second.
- File lookup returns the most specific exclusive path owner across both sets.
- Route lookup searches both sets and preserves parameter and `**` matching.
- `module`, `dependencies`, `tests` and `test` accept either kind of entry so
  agents keep one command vocabulary.
- CLI output includes `status: legacy`, `migrationTarget` and `exitCriteria` so
  a consumer cannot mistake a migration area for a completed module.

## First catalog slice

The first slice records only evidence-backed, high-value navigation gaps:

1. `server/index.ts` as the legacy server composition host;
2. `src/features/DeferredRoutes.tsx` as the deferred-route composition host;
3. `src/features/Battlegrounds.tsx` as the Battlegrounds host;
4. `/articles` with the existing `editorial` route owner;
5. Battlegrounds data and tool routes with the owners already declared in
   `config/public-route-inventory.json`.

Broader legacy coverage is a later additive slice. This increment must not
invent owners for paths whose responsibility is still ambiguous.

## Testing strategy

Use Node's built-in test runner and temporary filesystem fixtures. Follow the
RED-GREEN-REFACTOR cycle:

1. add failing validation and lookup tests;
2. implement the smallest catalog extension that passes them;
3. run the repository catalog and CLI lookups;
4. run architecture and release gates.

Tests assert outcomes rather than internal helper calls.

## Boundaries

### Always

- Preserve all existing module entries and command names.
- Validate catalog input before any command output or test execution.
- Keep route owners aligned with the existing public route inventory.
- Update architecture documentation and the changelog in this task.

### Ask first

- Rename an existing module or owner.
- Change the public route inventory.
- Add a dependency or a new catalog file.

### Never

- Move runtime source as part of this navigation-only increment.
- Treat `publicEntrypoints` as exclusive file ownership.
- Weaken physical module coverage or existing architecture gates.
- Claim complete legacy coverage from this first slice.

## Success criteria

- The repository catalog has validated legacy entries for every first-slice
  area.
- Key file and route lookups return deterministic legacy owners.
- Duplicate path/route ownership and incomplete legacy records fail tests.
- Existing module lookup and focused-test execution stay backward compatible.
- Architecture, documentation, security and full release gates pass.
- No application source or runtime behavior changes.

## Open questions

None for this increment. Further route families are added only after their
owners and focused tests are confirmed from repository evidence.
