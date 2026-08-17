# Application route manifest

## Status

Implemented on the architecture branch; awaiting integration after the module
boundary foundations.

## Objective

Create one typed application contract for route surfaces so a maintainer or AI
agent can answer, from one entry point:

- which stable surface id owns a navigation path;
- how the surface is grouped and entitled;
- which lazy module is loaded and warmed;
- which application code resolves and renders it.

This is an internal structural migration. Public URLs, canonical metadata,
permissions, history behavior, rendered content and chunk boundaries remain
unchanged.

The public URL inventory remains the deployment and SEO contract for all
static, listing, detail, redirect, legacy and fallback URLs. The application
manifest owns the smaller set of route surfaces that compose those URLs. Tests
must make their relationship explicit rather than treating navigation tabs and
all public URLs as the same concept.

## Tech stack

- React `^19.0.0` with module-scope `React.lazy` declarations.
- TypeScript `~5.8.2` with bundler module resolution.
- Vite `^6.4.3` with literal dynamic imports for stable code splitting.
- Node test runner through the repository test-suite registry.

## Commands

- Focused route contract: `npm run test:routes`.
- Test registry: `npm run test:registry`.
- Architecture checks: `npm run lint:architecture`.
- Production build: `npm run build`.
- Full release verification: `npm run verify:release`.
- Changed-code security: `npm run security:semgrep`.
- Secret scan: `npm run security:gitleaks`.

## Project structure

```text
src/
  app/
    routing/
      routeManifest.ts           # typed metadata, literal loaders and preload policy
      routeModules.tsx           # module-scope React.lazy adapters
      routeResolution.ts         # pure URL settlement model
      useApplicationNavigation.ts # history, metadata and navigation orchestration
      public.ts           # application routing contract
  App.tsx                 # composition consumer
  routes.ts               # temporary compatibility facade during migration

config/
  public-route-inventory.json  # complete SEO/deployment URL contract

tests/
  application-route-manifest.test.ts
  routes.test.ts
  client-route-resolution.test.ts
  route-inventory.test.ts
```

No application-wide barrel is introduced. `src/app/routing/public.ts` exposes
only the routing contract used by the composition root and focused tests.

## Contract and code style

Every route surface has a literal id, canonical path, navigation metadata,
entitlement and optional literal module preloader. Derived groups and lookup
maps come from the manifest; callers do not repeat route-id lists.

```ts
export const ROUTE_MANIFEST = [
  defineRouteSurface(
    {
      id: 'articles',
      label: 'Статьи',
      icon: BookOpenText,
      path: '/articles',
      group: 'top',
      entitlement: null,
    },
    loadDeferredRoutesModule,
  ),
] as const satisfies readonly ApplicationRouteSurface[];
```

Rules:

- use `path` for the canonical surface URL; keep the compatibility `slug`
  alias only while existing presentation callers migrate;
- derive `TabId`, route groups, entitlement maps and preload lookup from the
  manifest;
- keep literal dynamic imports beside their manifest records in
  `routeManifest.ts` so preload ownership is inspectable and Vite can retain
  statically analyzable chunks;
- declare every lazy React adapter at module scope in `routeModules.tsx`, and
  reuse the exact loader identity owned by the manifest;
- keep browser history, page metadata settlement and stale-navigation guards in
  `useApplicationNavigation.ts`;
- make `routePath` fail closed for an unknown route id instead of silently
  navigating to `/`;
- keep domain data fetching and permission decisions out of routing files;
- preserve optimistic surface selection for nested detail URLs while the
  public URL policy performs authoritative validation.

## Testing strategy

1. `tests/application-route-manifest.test.ts` proves unique ids and paths,
   canonical path lookup, derived compatibility metadata, preload coverage and
   shared loader identities without importing feature modules.
2. `tests/routes.test.ts` proves canonical and legacy surface resolution,
   entitlement derivation, navigation grouping and SEO-sensitive special URLs.
3. `tests/client-route-resolution.test.ts` proves history and authoritative
   not-found settlement independently of React rendering.
4. `tests/route-inventory.test.ts` proves all public URL inventory entries and
   prerender policies remain valid.
5. Source-boundary tests prove `App.tsx` does not regain module loaders or
   browser-history ownership.
6. The production build proves literal dynamic imports still emit lazy chunks.
7. Browser QA exercises direct navigation, in-app navigation and Back/Forward
   on desktop and mobile with a clean console and network log.

Tests assert observable route outcomes and manifest invariants, not internal
function call order.

## Boundaries

### Always

- add or change the contract test before moving implementation;
- preserve URL, canonical, entitlement, history and loading behavior;
- keep route metadata typed and derived from one manifest;
- lower the `App.tsx` size ratchet after extraction;
- update the ADR and architecture map in the same task.

### Ask first

- adding a routing dependency;
- changing a public URL, redirect, canonical policy or entitlement;
- combining currently separate Vite chunks;
- changing the browser history state shape.

### Never

- import a module's internal file from application routing;
- place domain business policy or raw data fetching in the manifest;
- generate dynamic import paths from unvalidated runtime strings;
- keep two writable route registries after consumers migrate;
- classify an inventory fallback as a valid application surface.

## Success criteria

- `src/App.tsx` imports route metadata, lazy views and preload behavior only
  through `src/app/routing/public.ts`.
- Route ids, canonical surface paths, navigation groups, entitlements and
  preload ownership have one typed source.
- The existing 25 route surfaces resolve exactly as before, including nested
  detail paths, `/connect`, public-profile paths, removed paths and the legacy
  Standard archetype URL.
- React lazy declarations remain at module scope and Vite dynamic imports stay
  literal.
- `src/App.tsx` is smaller and its ratchet is lowered.
- Primary authenticated navigation remains eager and does not gain a granular
  avatar request or loading flash as a side effect of the routing migration.
- Focused tests, route inventory, architecture checks, build and browser QA
  pass without changes to public behavior.

## Open questions

- The complete public URL inventory contains 48 URL contracts while the
  application currently has 25 route surfaces. A later slice may add an
  explicit `surfaceId` to each inventory entry; this slice must not conflate
  those two identifiers or change authoritative URL validation.
- `src/routes.ts` may remain as a read-only compatibility facade for existing
  tests during the first increment. It must contain no route data and should be
  deleted after all consumers move to the application public entry.
