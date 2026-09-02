# Machine-readable module catalog

`config/architecture-catalog.json` is the checked navigation index for every
physical module currently present below `src/modules/` and `server/modules/`,
plus the first catalogued legacy ownership surfaces outside those roots. It is
descriptive, not aspirational: module entries record their current status as
`modular` or `transitional`; `legacyAreas` records current ownership together
with a migration target and explicit exit criteria.

Each entry records:

- module name, owner, purpose and owned paths;
- narrow public entrypoints;
- frontend and backend routes;
- contracts, jobs and focused tests;
- cache namespaces, data stores and external services;
- allowed dependencies and forbidden imports.

A legacy entry also records `migrationTarget` and `exitCriteria`. Its `paths`
claim exclusive physical file ownership. `frontendRoutes` and `backendRoutes`
claim product behavior ownership and may name a shared host in
`publicEntrypoints`. This distinction lets a route such as `/articles` belong
to editorial while `DeferredRoutes.tsx` itself remains owned by the frontend
platform during extraction.

`npm run lint:architecture` validates the schema, referenced source/test paths
and exactly-one ownership for every physical module directory. It also rejects
overlapping path claims, duplicate route claims and incomplete legacy records.
Adding a new module directory without adding its catalog entry fails CI.

## Navigation commands

```bash
# Compact map of current modules and catalogued legacy areas
npm run architecture:map

# Owner, public contract, tests and impact of a source file
npm run architecture:impact -- src/modules/applicationConnect/api/client.ts
npm run architecture:impact -- server/index.ts

# Owner of an exact or parameterized backend/frontend route
npm run architecture:owner -- GET /api/v1/oauth/device/authorization
npm run architecture:owner -- FRONTEND /connect
npm run architecture:owner -- FRONTEND /articles

# Full module record or only dependency/test guidance
npm run architecture:module -- frontend-application-connect
npm run architecture:dependencies -- frontend-application-connect
npm run architecture:tests -- frontend-application-connect
npm run architecture:tests -- legacy-frontend-articles

# Execute the module's checked minimal test set
npm run test:module -- frontend-application-connect
```

Route patterns use `:parameter` for one path segment and `**` for the remaining
suffix. The catalog records externally meaningful mounted paths; the generated
HTTP manifest remains the detailed source-order and middleware snapshot.

## Practical routing for changes

- New endpoint: find the closest route owner, inspect its public entrypoint and
  add routes only at that module's HTTP boundary.
- New page or filter: find the frontend route owner; keep transport in its
  `api/` layer and pure transformations in model/schema code.
- New DTO: place the runtime parser in the owning module or root browser-safe
  contracts, then infer the TypeScript type from it.
- New job: record the owner, path, lifecycle, locking and focused test in both
  this catalog and the runtime service inventory.
- CDN/cache work: start from `cacheNamespaces`, the runtime inventory and the
  linked operations/runbook documentation before changing a key or TTL.

The catalog does not claim the repository is fully modular. Four current
module directories are explicitly transitional, and six first-slice legacy
areas are explicitly marked `legacy`. Legacy surfaces not yet present in
`legacyAreas` remain tracked by the modularization plan and size/source
ratchets; an absent lookup is not evidence that an area is modular.
