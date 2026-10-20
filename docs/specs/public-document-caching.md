# Public document caching and restored pages

## Objective

Back and Forward between public pages restore the page from the browser's
back/forward cache instead of reloading it, without ever showing one
viewer's account or paid data to another.

## Contract

- Anonymous public documents send `Cache-Control: private, no-cache`: no
  shared cache stores them, every normal visit revalidates, and the browser
  may keep the page for Back. The route families are listed in
  `apps/public-web/documentCaching.mjs` (`next.config.mjs` `headers()`; `/`
  without a `login` query through `proxy.ts`). Every other document keeps
  the header Next or Nginx chooses: `/?login`, `/admin/`, `/deck-builder/`,
  `/archetypes/`, `/connect/`, `/id/`, `/profiles/`, `/identity/` and the
  `503` of `proxy.ts` stay `no-store`.
- The header is set before the page renders, so a missing entity (`404`) or
  a server error (`500`) inside a listed family carries it too. Such a page
  is never restored from the back/forward cache (only `200` documents are),
  but Back may show it from the browser's HTTP cache until the visitor
  reloads.
- The HTML of the listed families is the same for every visitor: their
  server modules read no cookies (`tests/next-document-caching.test.mjs`).
  Viewer and paid data come from `/api/` in the browser through
  `usePublicAccess()`.
- Every answer the server gives `usePublicAccess()` about the viewer (each
  session check, sign-in, sign-out and subscription read) is recorded in
  `localStorage` as one digest of the account, its administrator roles and
  its entitlements, or `guest` (`apps/public-web/ui/restoredPageAccess.ts`).
- On a persisted `pageshow`, a page that shows a viewer hides it, with every
  paid view, synchronously before its first frame, whatever the record says:
  while the page was frozen the session may have been revoked or replaced
  without any page of ours hearing of it. It shows the viewer again only when
  the session and subscription checks both confirm it, and then both at once,
  within the check's deadline; a check that fails or runs out of time leaves
  the page without the viewer. A page restored as a guest turns pending too
  (someone may have signed in meanwhile), so its old gate never shows a lock
  to a subscriber. Every check of a restored page, its retry included, shows
  a viewer only with a confirmed subscription until one check confirms both.
- A quiet check that cannot reach the server hides the viewer as well: a
  remembered session then shows the pending state and retries within a
  bounded deadline before it offers a gate with a retry action, a guest sees
  the gate.
- A new page may show the viewer this browser remembers for the current
  session before its session check answers, under the rules of
  [instant viewer access](instant-viewer-access.md).
- Views that hold viewer data derive it from the current viewer in the same
  render (`/classes/` statistics, article votes, contest entries), so hiding
  the viewer drops them.

## Remaining gap

None known for restored pages: they never show a viewer before the server
confirms it again. The cost is a short pending state when a signed-in visitor
goes Back.

## Verification

`tests/next-bfcache-browser.test.mjs` checks the headers, a guest restore
with its scroll position, a subscriber restore (hidden, then confirmed), a
session revoked on the server while the page was frozen, a late and a hung
subscription answer after a restore, sign-out then Back
on the Battlegrounds tier list and on `/classes/`, a revoked session followed
by a redirect sign-in of another account then two steps Back (online and
offline), and an offline restore of an unchanged viewer.
`tests/public-restored-page-access.test.ts` checks the record and that the
hook hides a restored viewer before it checks again.

## Documentation impact

`apps/public-web/README.md` (rules) and
`docs/runbooks/nextjs-production-cutover.md` (the Nginx home page change).
