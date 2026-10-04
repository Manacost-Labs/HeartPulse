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
- On a persisted `pageshow`, a page that shows a viewer compares that viewer
  with the record. If they differ, or the record cannot be read, it hides the
  viewer and every paid view synchronously, before its first frame, and then
  checks the session. If they match, it checks quietly and keeps the page.
- A quiet check that cannot reach the server hides the viewer as well: a
  remembered session then shows the pending state and retries, a guest sees
  the gate.
- Views that hold viewer data derive it from the current viewer in the same
  render (`/classes/` statistics, article votes, contest entries), so hiding
  the viewer drops them.

## Remaining gap

The record holds what one of our pages last heard from the server. A change
that no page of ours has observed yet, such as a session that expired or was
revoked on another device while every open page was in the back/forward
cache, leaves the record unchanged. A restored page then shows its previous
viewer, a viewer this browser was already showing, until its quiet check
answers (one round trip), or until that check fails and the page hides.

## Verification

`tests/next-bfcache-browser.test.mjs` checks the headers, a guest restore
with its scroll position, a subscriber restore, sign-out then Back on the
Battlegrounds tier list and on `/classes/`, a revoked session followed by a
redirect sign-in of another account then two steps Back (online and
offline), and an offline restore of an unchanged viewer.
`tests/public-restored-page-access.test.ts` checks the record and the
decision.

## Documentation impact

`apps/public-web/README.md` (rules) and
`docs/runbooks/nextjs-production-cutover.md` (the Nginx home page change).
