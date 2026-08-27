# Phase 0: evidence-backed dead-code removal

## Scope and proof

This slice removes only the retired private `AdminPanel` implementation from
`src/features/DeferredRoutes.tsx` and the twelve top-level declarations owned
exclusively by it. The removal is based on three independent checks:

- TypeScript AST references show no caller for the private `AdminPanel` or its
  support declarations.
- Repository-wide symbol search finds the live admin route in `src/App.tsx`;
  it lazy-loads the exported `ContestAdminPanel` from
  `src/features/Contests.tsx`, not the retired implementation.
- Knip reports other possible unused files and exports, but none is removed in
  this slice. Static-analysis output is treated as a lead, not sufficient proof.

The removed declarations are `AdminForm`, `AdminSectionId`,
`AdminUserListItem`, `BoostySubscriberRow`, `BoostySubscribersPayload`,
`BoostyAdminStatus`, `EMPTY_FORM`, `ADMIN_SECTIONS`,
`getInitialAdminSection`, `ADMIN_INPUT`, `AdminStatCard`, `AdminArticleRow` and
`AdminPanel`.

## Compatibility guard

`npm run lint:architecture` now fails if any retired declaration returns. The
same check also requires both ends of the live route contract:

- `src/App.tsx` must resolve `module.ContestAdminPanel`;
- `src/features/Contests.tsx` must export `ContestAdminPanel`.

The presentation-boundary check now ends the public login region at
`InternalLinks`, the next live declaration. This prevents a future large block
from being hidden behind the old dead-code marker.

## Measured result

`DeferredRoutes.tsx` falls from 6,422 to 4,829 physical lines, and its enforced
ceiling moves down to 4,829. A production build changes the route chunk from
108,046 bytes (`DeferredRoutes-Bm9XlazT.js`) to 106,594 bytes
(`DeferredRoutes-Ck7a516c.js`), a reduction of 1,452 bytes. The smaller bundle
shows that some support code still reached the generated chunk; most of the
private implementation had already been eliminated by the bundler.

Route-registry, deferred-boundary, admin-workspace, TypeScript and production
build checks pass after removal. No public path, request, response, storage,
authorization or SEO contract is changed.

## Rollback

Rollback is a single commit revert. It restores only unreachable source and the
previous ratchet; it requires no data migration, configuration change or
production operation.
