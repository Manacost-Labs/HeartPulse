# HearthPulse AI project map

Use this focused map after reading the repository `AGENTS.md`. It tells an AI
agent where to look next; linked documents remain the source of truth.

## Identity and scope

- Engineering project and repository: **HearthPulse**.
- Canonical public origin: `https://hearthpulse.net`.
- `arena.hs-manacost.ru` is a retired compatibility host. Historical migration
  docs and redirect tests may still name it.
- The interface can still use the Manacost Arena product brand. Do not treat
  engineering identity cleanup as permission for a visual rebrand.
- One repository contains the React frontend, Express API, data jobs, release
  tooling, tests and project documentation.

## Runtime shape

```text
browser
  -> src/main.tsx
    -> src/App.tsx              frontend composition and route selection
      -> src/modules/*          catalogued domain modules
      -> src/features/*         mostly legacy or transitional feature areas

HTTP / scheduled work
  -> server/index.ts            server composition and legacy registrations
    -> server/app/*             application wiring and lifecycle
    -> server/modules/*         catalogued domain modules
    -> server/shared/*          domain-independent server primitives
```

The required dependency direction is `app -> modules -> shared`. A module owns
its product behavior and exposes a narrow public entrypoint. Shared code must
remain domain-independent. See
[`module-boundaries.md`](module-boundaries.md) before changing ownership or
dependencies.

## Current ownership model

`config/architecture-catalog.json` is the machine-readable inventory of every
physical directory in `src/modules/` and `server/modules/`. Entries are:

- `modular` when the area already meets its focused ownership boundary;
- `transitional` when an explicit compatibility dependency remains.

The catalog does not cover every legacy product area. Large files such as
`server/index.ts`, `src/App.tsx`, `src/features/DeferredRoutes.tsx` and
`src/features/Battlegrounds.tsx` are migration surfaces, not examples for new
code. Their extraction order and ratchets live in
[`modularization-plan.md`](modularization-plan.md).

## Find the owner before reading broadly

```bash
# Current modules, status and purpose
npm run architecture:map

# Owner, public contract, dependencies and focused tests for a file
npm run architecture:impact -- src/modules/applicationConnect/api/client.ts

# Owner of a backend or frontend route
npm run architecture:owner -- GET /api/v1/oauth/device/authorization
npm run architecture:owner -- FRONTEND /connect

# One module's record, dependency policy or test set
npm run architecture:module -- frontend-application-connect
npm run architecture:dependencies -- frontend-application-connect
npm run architecture:tests -- frontend-application-connect

# Execute the catalogued minimal test set
npm run test:module -- frontend-application-connect
```

If a lookup has no owner, consult
[`module-catalog.md`](module-catalog.md) and the migration plan. Treat the path
as legacy until evidence establishes its owner; do not invent a module name.

## Minimal context recipe

For a normal change, load only:

1. `AGENTS.md` and this map;
2. the matching Notion task and its acceptance criteria;
3. the owning public entrypoint or route plus direct callers;
4. the focused model, adapter and test files returned by the catalog;
5. the one authoritative architecture, specification or runbook document;
6. repository history for the changed lines when intent is still unclear.

Expand outward only when a contract, import or runtime signal requires it.
Prefer `rg` for exact text and `ast-grep` for structural searches. When the
repository contains a `.codegraph/` index, use `codegraph explore` before
manual code search.

## Where documentation belongs

| Question | Source of truth |
| --- | --- |
| Ownership and dependency direction | `docs/architecture/` |
| Expensive engineering decision | `docs/decisions/` |
| Public behavior, API, data or permission | `docs/specs/` |
| Deployed topology and observed state | `docs/operations/` |
| Deployment, monitoring, recovery or rollback | `docs/runbooks/` |
| AI integrations and local analysis | [`../agent-tooling.md`](../agent-tooling.md) |
| User- or maintainer-visible shipped change | `CHANGELOG.md` |

The documentation taxonomy is defined in [`../README.md`](../README.md). Link
to an existing source of truth instead of duplicating its full rules.

## Verification ladder

Start with the smallest command that proves the changed contract, then widen
in proportion to risk:

```bash
# Focused ownership tests where a module exists
npm run test:module -- <module>

# Documentation and agent-contract changes
npm run test:agent-tooling
npm run test:documentation-truth
npm run lint:docs

# Architecture-affecting changes
npm run lint:architecture

# Authored JavaScript or TypeScript changes
npm run security:semgrep

# Full release gate before integration
npm run verify:release
```

Browser-facing changes also require a real-browser review under the viewports
and signals required by `AGENTS.md`. Deployment work follows `DEPLOYMENT.md`
and its linked runbooks; a feature-branch push never deploys production.

## Editing boundaries

- Work in the source repository and an isolated task worktree.
- Do not edit `/var/www` as source. It contains production/runtime copies.
- Do not author changes inside generated `dist/`, `build/`,
  `storybook-static/` or dependency `node_modules/` directories.
- Do not read or print `.env`, tokens, cookies, private keys or production data
  unless the task explicitly requires the minimum necessary access.
- Do not add new behavior to a ratcheted monolith. Extract the narrow owning
  slice with its contract test and lower the relevant budget.
- Do not create generic `utils` or `common` dumping grounds, eager global
  barrels, domain-to-app imports or undocumented cross-module dependencies.

## Authoritative follow-up documents

- Boundaries and definition of done:
  [`module-boundaries.md`](module-boundaries.md)
- Current catalog semantics and navigation:
  [`module-catalog.md`](module-catalog.md)
- Legacy hotspots and extraction order:
  [`modularization-plan.md`](modularization-plan.md)
- AI tooling and security constraints:
  [`../agent-tooling.md`](../agent-tooling.md)
- Release and rollback entrypoint: [`../../DEPLOYMENT.md`](../../DEPLOYMENT.md)
- Reliability baseline and stop-the-line rules:
  [`../../STABILIZATION.md`](../../STABILIZATION.md)
