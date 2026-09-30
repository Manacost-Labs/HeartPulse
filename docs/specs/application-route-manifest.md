# Application route manifest

## Status

Implemented. The manifest was written for the single-page shell that was
deleted on 2026-09-30. Next.js App Router now owns URL resolution, rendering,
history and page metadata, and the pages use only the navigation metadata,
`tabFromPath` and `BG_TAB_IDS`. The module loaders and preload helpers of the
manifest have no caller outside tests and are to be removed
(`docs/plans/nextjs-full-site-migration.md`, section 7).

## Objective

Create one typed application contract for route surfaces so a maintainer or AI
agent can answer, from one entry point:

- which stable surface id owns a navigation path;
- how the surface is grouped and entitled;
- which navigation entry is active for a URL.

The Next.js route for a surface lives under `apps/public-web/app/`; the
[route coverage ledger](../plans/nextjs-route-coverage.md) maps URL patterns
to their pages.

This is an internal structural migration. Public URLs, canonical metadata,
permissions, history behavior, rendered content and chunk boundaries remain
unchanged.

The public URL inventory remains the deployment and SEO contract for all
static, listing, detail, redirect, legacy and fallback URLs. The application
manifest owns the smaller set of route surfaces that compose those URLs. Tests
must make their relationship explicit rather than treating navigation tabs and
all public URLs as the same concept.

## Tech stack

- React `^19.0.0` and Next.js App Router.
- TypeScript `~5.8.2` with bundler module resolution.
- Node test runner through the repository test-suite registry.

## Commands

- Focused route contract: `npm run test:routes`.
- Test registry: `npm run test:registry`.
- Architecture checks: `npm run lint:architecture`.
- Production build: `npm run build:next` (pages) and `npm run build` (static
  root and server).
- Full release verification: `npm run verify:release`.
- Changed-code security: `npm run security:semgrep`.
- Secret scan: `npm run security:gitleaks`.

## Project structure

```text
src/
  app/
    routing/
      navigationDefinitions.ts   # ids, labels, icons, paths, groups, entitlements
      navigationRoutes.ts        # navigation groups used by the page shell
      routeManifest.ts           # typed surfaces, tabFromPath, unused module loaders
      public.ts                  # routing contract used by tests
    shell/
      PublicPageShell.tsx        # page shell: consumes the groups and BG_TAB_IDS
  shared/
    seo/
      publicRouteInventory.json  # complete SEO/deployment URL contract
  routes.ts               # compatibility facade for tests and one story

tests/
  application-route-manifest.test.ts
  routes.test.ts
  route-inventory.test.ts
```

No application-wide barrel is introduced. `src/app/routing/public.ts` exposes
only the routing contract used by focused tests.

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
- do not add module loaders to the manifest: a Next.js page imports its view
  itself, and the existing loaders are waiting for removal;
- leave browser history, page metadata and stale-navigation handling to
  Next.js: every navigation loads a document;
- make `routePath` fail closed for an unknown route id instead of silently
  navigating to `/`;
- render unknown Next HTML with a real HTTP 404, `noindex, nofollow`, the
  public navigation and the generic missing-page actions; card details may
  keep their more specific missing-card message;
- keep `/deck-builder/` private and `noindex, nofollow`: only a full
  administrator may load the editor, and the browser must recheck that role
  before importing it. The draft stays in browser storage; `/api/admin/`
  mutations remain authorized by Express;
- keep `/archetypes/`, `/archetypes/:numericId/` and `/archetypes/wild/`
  private, `noindex, nofollow` and uncached. Only full administrators can load
  either catalog or detail data. The Wild selection query identifies an
  archetype, while deck codes open `/deck-builder/?code=...`; Express remains
  the authority for archetype and deck data;
- keep domain data fetching and permission decisions out of routing files;
- preserve optimistic surface selection for nested detail URLs while the
  public URL policy performs authoritative validation.

## Testing strategy

1. `tests/application-route-manifest.test.ts` proves unique ids and paths,
   canonical path lookup, derived compatibility metadata, preload coverage and
   shared loader identities without importing feature modules.
2. `tests/routes.test.ts` proves canonical and legacy surface resolution,
   entitlement derivation, navigation grouping and SEO-sensitive special URLs.
3. `tests/route-inventory.test.ts` proves all public URL inventory entries and
   the SEO registry pages remain valid.
4. The manifest test pins 19 distinct loader identities and proves the login
   overlay no longer shares the `DeferredRoutes` loader.
5. `tests/next-not-found-browser.test.mjs` proves an unknown URL is a real
   404 document with the public navigation.
6. Browser QA exercises direct navigation, navigation through the menu and
   Back/Forward on desktop and mobile with a clean console and network log.

Tests assert observable route outcomes and manifest invariants, not internal
function call order.

## Boundaries

### Always

- add or change the contract test before moving implementation;
- preserve URL, canonical, entitlement, history and loading behavior;
- keep route metadata typed and derived from one manifest;
- update the ADR and architecture map in the same task.

### Ask first

- adding a routing dependency;
- changing a public URL, redirect, canonical policy or entitlement.

### Never

- import a module's internal file from application routing;
- place domain business policy or raw data fetching in the manifest;
- generate dynamic import paths from unvalidated runtime strings;
- keep two writable route registries after consumers migrate;
- classify an inventory fallback as a valid application surface.

## Success criteria

- Route ids, canonical surface paths, navigation groups and entitlements have
  one typed source.
- The existing 25 route surfaces resolve exactly as before, including nested
  detail paths, `/connect`, public-profile paths, removed paths and the legacy
  Standard archetype URL.
- Primary authenticated navigation remains eager and does not gain a granular
  avatar request or loading flash as a side effect of the routing migration.
- Focused tests, route inventory, architecture checks, build and browser QA
  pass without changes to public behavior.

## Open questions

- The complete public URL inventory contains 48 URL contracts while the
  application currently has 25 route surfaces. A later slice may add an
  explicit `surfaceId` to each inventory entry; this slice must not conflate
  those two identifiers or change authoritative URL validation.
- `src/routes.ts` remains a read-only compatibility facade for three tests
  and one story. It must contain no route data and should be deleted together
  with the unused loaders.
