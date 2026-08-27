# Machine-readable module catalog

`config/architecture-catalog.json` is the checked navigation index for every
physical module currently present below `src/modules/` and `server/modules/`.
It is descriptive, not aspirational: each entry records its current status as
`modular` or `transitional` and names the compatibility dependency that still
prevents a transitional area from meeting the target boundary.

Each entry records:

- module name, owner, purpose and owned paths;
- narrow public entrypoints;
- frontend and backend routes;
- contracts, jobs and focused tests;
- cache namespaces, data stores and external services;
- allowed dependencies and forbidden imports.

`npm run lint:architecture` validates the schema, referenced source/test paths
and exactly-one ownership for every physical module directory. Adding a new
directory without adding its catalog entry fails CI.

## Navigation commands

```bash
# Compact map of every current module
npm run architecture:map

# Owner, public contract, tests and impact of a source file
npm run architecture:impact -- src/modules/applicationConnect/api/client.ts

# Owner of an exact or parameterized backend/frontend route
npm run architecture:owner -- GET /api/v1/oauth/device/authorization
npm run architecture:owner -- FRONTEND /connect

# Full module record or only dependency/test guidance
npm run architecture:module -- frontend-application-connect
npm run architecture:dependencies -- frontend-application-connect
npm run architecture:tests -- frontend-application-connect

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

The catalog does not claim the repository is fully modular. Five current
directories are explicitly transitional; legacy product areas still outside
`modules/` remain tracked by the modularization plan and size/source ratchets.
