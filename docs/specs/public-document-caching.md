# Public document caching and restored pages

## Objective

Back and Forward between public pages restore the page from the browser's
back/forward cache instead of reloading it, without ever showing one
viewer's account or paid data to another.

## Contract

- Anonymous public documents send `Cache-Control: private, no-cache`: every
  normal visit revalidates and the browser may keep the page for Back. They
  also send `X-HearthPulse-Edge-Cache: anonymous`, the only shared copy this
  contract allows (see below). The route families are listed in
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

## Shared copy at the regional edge

- The marker is set with `Cache-Control`, so a `404`, `500` or the `503` of
  `proxy.ts` inside a listed family carries it too; the edge never stores
  those.
- The HearthPulse edge (`deploy/nginx/hearthpulse-shadow-app.conf`) stores a
  document or RSC payload only if the request carries no `Cookie` and no
  `Authorization`, the answer is a `200` without `Set-Cookie`, it carries the
  marker, its type is `text/html` or `text/x-component`, and its `Vary` lists
  exactly `rsc, next-router-state-tree, next-router-prefetch,
  next-router-segment-prefetch, Accept-Encoding`. Those request headers and
  `Next-Url` are part of the key. The edge blanks the Next-internal request
  headers that change the answer without being in the key
  (`X-Middleware-Prefetch`, `X-Nextjs-Data`, `Next-Hmr-Refresh`,
  `Content-Security-Policy`), so a guest cannot store a different body under
  a document's key.
- A copy is fresh for 60 seconds; the ISR pages whose HTML holds no server
  data (`revalidate = 300`, except the post-deploy data pages
  `/standard/meta/` and `/articles/`) for 300 seconds. An expired copy is
  answered at once while one background request refreshes it. The key carries a
  ten-minute epoch of the edge clock, so no copy is answered more than ten
  minutes after it was stored: a removed page, a lost marker or an origin
  failure is hidden for at most that long, and the first request of each
  epoch sees the origin's own answer. A copy without a visit for ten minutes
  is dropped.
- The key joins the epoch and the RSC request headers with `|` before the
  URI; a request
  whose `RSC` or `Next-Router-Prefetch` is not empty or `1`, or whose other
  key headers contain `|`, bypasses the copy, so no two requests share an
  entry.
- A request with a cookie never reads or fills the copy, so a signed-in or
  paying visitor always receives the origin's own rendering. The marker is
  removed before the response leaves the edge, and browsers keep
  `private, no-cache`; the edge ignores the application's `Cache-Control`
  for documents, including the `s-maxage` of prerendered pages.
- Install, check and roll back: `docs/runbooks/hearthpulse-edge-caching.md`.

## Back/forward cache blockers

Checked in Chromium on production (release `51d3637b`) with
`Page.backForwardCacheNotUsed`: every listed family and the prerendered
support pages are restored. The `no-store` of `/api/auth/me` and the other
`/api/` answers does not block a document that sends `private, no-cache`
(Chromium reports `JsNetworkRequestReceivedCacheControlNoStoreResource` only
together with a `no-store` main resource), so those answers keep `no-store`.
Only `/` failed, because Nginx added a second, `no-store` header; it now adds
it for a `login` query only. `/?login` stays out by design. No route registers
an `unload` handler or keeps a connection open across navigation.

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
`tests/nginx-html-routing.test.mjs` runs the origin home location with and
without `login`; `tests/hearthpulse-shadow-nginx.test.mjs` runs the edge
document location against a stub origin (stored, bypassed with a cookie,
never stored without the marker, with `Set-Cookie`, another `Vary`, a bare
`{}` or a `404`, an ambiguous key bypassed, an expired copy refetched and
never served, not even for an origin failure).

## Documentation impact

`apps/public-web/README.md` (rules),
`docs/runbooks/nextjs-production-cutover.md` (the Nginx home page) and
`docs/runbooks/hearthpulse-edge-caching.md` (the edge copy).
