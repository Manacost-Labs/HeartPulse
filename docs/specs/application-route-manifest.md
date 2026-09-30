# Application navigation routes

## Status

Implemented. This file keeps its name from the route manifest of the
single-page shell. That shell and its manifest (module loaders, preload policy,
client history and metadata handling) were deleted on 2026-09-30: Next.js App
Router owns URL resolution, rendering, history and page metadata. What remains
is the typed list of navigation surfaces described here.

## Objective

Keep one typed source from which a maintainer or AI agent can answer:

- which stable surface id owns a navigation path;
- how the surface is grouped in the menus and which subscription it sells;
- which navigation entry is highlighted for a URL.

The page for a surface lives under `apps/public-web/app/`; the
[route coverage ledger](../plans/nextjs-route-coverage.md) maps URL patterns
to their pages.

The public URL inventory remains the deployment and SEO contract for all
static, listing, detail, redirect, legacy and fallback URLs. The navigation
list owns the smaller set of surfaces that the menus link to. Tests must make
their relationship explicit rather than treating navigation entries and all
public URLs as the same concept.

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
      navigationRoutes.ts        # menu groups, BG_TAB_IDS, tabFromPath
      canonicalPagePath.ts       # trailing-slash form of a page link
    shell/
      PublicPageShell.tsx        # page shell: renders the groups
  shared/
    seo/
      publicRouteInventory.json  # complete SEO/deployment URL contract

apps/public-web/
  ui/navigation.ts               # loads the document of a path or surface id

tests/
  routes.test.ts
  route-inventory.test.ts
  responsive-route-inventory.test.ts
```

## Contract and code style

Every surface has a literal id, canonical path, label, icon, menu group and
the subscription its section sells. Groups and lookups are derived from the
list; callers do not repeat route-id lists.

```ts
export const NAVIGATION_ROUTES = [
  {
    id: 'articles',
    label: 'Статьи',
    icon: BookOpenText,
    path: '/articles',
    group: 'top',
    entitlement: null,
  },
] as const satisfies readonly NavigationRouteDefinition[];
```

Rules:

- add a surface in `navigationDefinitions.ts` only; `navigationRoutes.ts`
  derives `TabId`, the menu groups and `BG_TAB_IDS` from it;
- `entitlement` names the subscription that the section sells. It must equal
  the entitlement of the same route in the public URL inventory, which the
  responsive QA fixtures are checked against; the page itself enforces access;
- `tabFromPath` only chooses the highlighted navigation entry. A path outside
  every section, including an unknown one, belongs to `home`; whether a URL
  exists is decided by Next.js and the public URL policy;
- do not add module loaders or preload policy here: a Next.js page imports its
  view itself;
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
- keep domain data fetching and permission decisions out of routing files.

## Testing strategy

1. `tests/routes.test.ts` pins the 25 surface ids and canonical paths, proves
   they are unique, that every surface except the home page, FAQ and the
   footer links belongs to exactly one menu group, and that `tabFromPath`
   resolves canonical, nested, legacy and unknown paths.
2. `tests/route-inventory.test.ts` proves all public URL inventory entries and
   the SEO registry pages remain valid and agree with the navigation
   entitlements.
3. `tests/responsive-route-inventory.test.ts` proves the browser QA fixtures
   match the inventory entitlements.
4. `tests/next-not-found-browser.test.mjs` proves an unknown URL is a real
   404 document with the public navigation.
5. Browser QA exercises direct navigation, navigation through the menu and
   Back/Forward on desktop and mobile with a clean console and network log.

Tests assert observable route outcomes and list invariants, not internal
function call order.

## Boundaries

### Always

- add or change the contract test before moving implementation;
- preserve URL, canonical and entitlement behavior;
- keep navigation metadata typed and derived from one list;
- update the ADR and architecture map in the same task.

### Ask first

- adding a routing dependency;
- changing a public URL, redirect, canonical policy or entitlement.

### Never

- import a module's internal file from application routing;
- place domain business policy or raw data fetching in the navigation list;
- keep two writable route registries;
- classify an inventory fallback as a valid application surface.

## Success criteria

- Route ids, canonical surface paths, navigation groups and entitlements have
  one typed source.
- The 25 surfaces resolve as before, including nested detail paths, removed
  paths and the legacy Standard archetype URL.
- Focused tests, route inventory, architecture checks, build and browser QA
  pass without changes to public behavior.

## Open questions

- The complete public URL inventory contains 48 URL contracts while the
  navigation has 25 surfaces. A later slice may add an explicit `surfaceId` to
  each inventory entry; it must not conflate those two identifiers or change
  authoritative URL validation.
