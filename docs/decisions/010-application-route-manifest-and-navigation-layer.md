<!-- markdownlint-disable MD013 -->

# ADR-010: Application route manifest and navigation layer

## Status

Accepted; implemented on the architecture branch and awaiting integration.

## Date

17 August 2026.

## Context

The client has two related but different routing contracts:

- 25 application surfaces that own navigation, access metadata, lazy views and preload intent;
- 48 public URL policies that own SEO, prerendering, aliases, detail paths, redirects and authoritative not-found behavior.

Previously `src/App.tsx`, `src/routes.ts` and local lazy declarations shared this responsibility. Route ids, paths, navigation groups, entitlements, module loaders, preload behavior, history state and page metadata were easy to change independently. A maintainer or AI agent had to read a large composition component and several registries before it could safely add or modify one surface.

The migration must preserve URLs, permissions, canonical policy, browser history, rendered content and route-owned Vite chunks. It must not turn every public URL policy into a navigation surface or add a new routing dependency during a structural extraction.

## Decision

Create a focused application routing boundary under `src/app/routing`:

- `routeManifest.ts` is the single typed registry for the 25 surface ids, canonical `path`, navigation metadata, entitlement, literal module loader and preload policy;
- `routeModules.tsx` declares module-scope `React.lazy` adapters and reuses the exact loader identities owned by the manifest;
- `routeResolution.ts` owns the pure known, unavailable and not-found settlement model;
- `useApplicationNavigation.ts` owns initial route state, Back/Forward synchronization, `pushState`/`replaceState`, metadata settlement and stale-navigation protection;
- `public.ts` is the only application routing entry imported by the composition root.

The complete public URL inventory remains the authority for URL validity, redirects, canonical behavior and prerender policy. Surface matching remains optimistic so a nested detail URL can select its owning feature before inventory policy settles the final result.

The canonical field is `path`. `src/routes.ts` remains a narrow, read-only compatibility facade and derives its legacy `slug` views from the manifest. New application code must use `path`; new route data must not be added to the facade.

Literal imports stay explicit instead of being constructed from runtime strings. Unknown route ids fail closed in `routePath` rather than silently navigating to `/`. The navigation hook returns a named object so call sites remain readable and adding a field cannot shift tuple positions.

No new client router is introduced in this slice. Primary authenticated navigation also remains eager; route extraction must not add a small avatar chunk, loading flash or authenticated-only failure path.

## Consequences

- A route surface and its module/preload ownership can be found from one manifest record.
- The composition root no longer declares route module loaders or manipulates browser history directly.
- `src/App.tsx` falls from the 1,966-line baseline to 1,793 lines and its ratchet is lowered with the extraction.
- All 25 id/path pairs and all 18 loader identities are pinned by a focused contract test without executing a dynamic import.
- The 48-entry public inventory and the 25-entry application manifest remain deliberately separate contracts.
- Existing route chunk ownership and the primary authenticated navigation flow remain unchanged.
- `src/routes.ts` and the `slug` alias are temporary migration debt; they can be deleted only after every compatibility consumer moves to the application contract.
- Authentication, subscription orchestration and the shell layout still remain in `App.tsx`; this decision establishes their destination but does not claim the application-shell migration is complete.

## Alternatives considered

### Adopt a client router immediately

Rejected for this slice. It would combine dependency adoption, history semantics, route extraction and rendering changes, making regressions harder to isolate. A router can be evaluated later against the now-explicit contract.

### Treat all 48 public URL policies as application surfaces

Rejected. Detail URLs, redirects, aliases, removed pages and fallback rules are deployment and SEO policy, not navigation entries. Conflating them would make route ownership less clear and could change authoritative 404 behavior.

### Keep module ids in the manifest and a second loader table

Rejected because it recreates two writable registries. Colocating the literal loader with the surface lets tests prove identity sharing while Vite retains statically analyzable imports.

### Return navigation state as a positional tuple

Rejected because call sites become opaque and a future field insertion can silently reorder values. A named object is safer for both human review and automated code changes.

### Lazy-load the authenticated avatar to reduce anonymous startup bytes

Rejected in this routing change. It introduces an extra request and fallback flash in a primary authenticated flow and changes the Vite manifest. Such an optimization requires its own measured task, authenticated browser QA and error-boundary decision.

## Supporting references

- React requires lazy component declarations at module scope and caches the loader promise and resolved module: [React `lazy` reference](https://react.dev/reference/react/lazy).
- Vite preserves code splitting for statically analyzable literal dynamic imports: [Vite 6 features guide](https://v6.vite.dev/guide/features#dynamic-import).

## Follow-up

1. Extract authentication and subscription orchestration into focused application providers/hooks.
2. Extract the shell layout and navigation presentation under `src/app/shell`.
3. Attach public inventory entries to explicit surface owners only when the mapping can preserve detail, alias and fallback semantics.
4. Delete the compatibility facade after its remaining consumers use `src/app/routing/public.ts`.
