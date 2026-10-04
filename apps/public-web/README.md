# HearthPulse public web (Next.js)

This app renders every public HTML page of `https://hearthpulse.net`
(Next.js 16 App Router, React 19, webpack build). Express in `server/` owns
`/api/`, `/identity/`, sessions, subscriptions, sitemaps and data jobs. Nginx
decides which process answers each URL: `deploy/nginx/arena-html-routing.conf`
sends HTML routes and `/_next/` to Next on `127.0.0.1:4321` and APIs to
Express on `127.0.0.1:3101`. Static files come from the release `dist/`
directory: a copy of `public/` plus generated sitemaps.

Most pages still render legacy React views from `src/` on the client. Treat
that as migration debt: new behavior belongs in `src/modules/<domain>`
behind its `public.ts`, not in `src/features/`.

## Layout

<!-- markdownlint-disable MD013 -->
| Path | Owns |
| --- | --- |
| `app/<route>/page.tsx` | URL, metadata, anonymous server-side data, then the page: one client page component, or server-rendered content inside a client shell |
| `app/layout.tsx`, `app/not-found.tsx`, `app/error.tsx` | Document shell with the site-wide head tags, analytics script and field focus mode; real 404 and the generic error page for every route |
| `ui/*PageClient.tsx` | Client page: viewer access, data hooks and the legacy view inside `PublicPageShell` |
| `ui/PublicSupportPage.tsx`, `ui/PublicSupportShell.tsx` | `/faq/`, `/privacy/`, `/terms/`: content rendered on the server, passed as children to the client shell |
| `ui/usePublicAccess.ts` | Browser session, subscription and admin state for the viewer; re-checks it on a page restored from the back/forward cache (`ui/restoredPageAccess.ts`) |
| `ui/lazyBattlegrounds.tsx` | The paid Battlegrounds views, loaded only for a viewer who may open them |
| `ui/PageBannerPreload.tsx` | Head preload of the page-banner art, for pages whose LCP is that banner |
| `ui/navigation.ts` | `navigate()` and `navigateTab()` (full-document navigation to the canonical trailing-slash URL) |
| `app/page-transitions.css` | Opt-in to cross-document view transitions (the animation itself is the `route-content` block of `src/index.css`) and the entrance of a load that no transition animates |
| `lib/pageEntrance.ts` | Inline head script that marks `<html>` with `data-page-enter` while that entrance plays, and keeps the outgoing page's snapshot where the reader saw it during a transition (`--vt-old-shift`) |
| `lib/authPrefetch.ts` | Inline head script that starts the session check (`/api/auth/me`) while the document parses |
| `lib/speculationRules.ts` | Which links Chromium prerenders on hover or press, and which sidebar links it prefetches (HTML only) on a brief hover |
| `lib/analyticsLoader.ts` | Inline Plausible loader: canonical host only, after a prerendered page is opened |
| `lib/expressApi.ts` | `fetchPublicExpress()`: anonymous server reads of Express `/api/` paths |
| `lib/seoPageMetadata.ts` | Metadata of pages in `config/public-seo-pages.json` |
| `lib/public*.ts` | Server-only loaders that validate public Express projections |
| `lib/publicFirstPaintRead.ts` | `readFirstPaintJson()`: a server read that only improves the first paint; `null` after 600 ms or on any failure, so the page falls back to its browser request |
| `lib/runtimeClientConfig.ts` | Root-managed runtime switches (card-image CDN) for server rendering and the inline document config |
| `proxy.ts` | Request proxy for card, hero, library and cosmetics detail probes, and the home page's `Cache-Control` |
| `documentCaching.mjs` | Which public documents send `private, no-cache` instead of `no-store` (`next.config.mjs` `headers()`) |
<!-- markdownlint-enable MD013 -->

## Rules

- Import siblings with `./`; import everything else as `@/<repository path>`
  (for example `@/src/modules/subscriptions/public`). Never `../`, never
  `server/`. `tests/next-import-paths.test.mjs` enforces this.
- Server components fetch only anonymous public projections through
  `fetchPublicExpress()`. A read that only puts data into the first paint
  (the meta and fun-deck guest previews, the archetype catalog teaser, the
  first cosmetics page) goes through `readFirstPaintJson()`: it never holds
  the document longer than 600 ms and never fails it, and the page then loads
  the same data in the browser. Seed the client state with exactly the
  request the page would make, so it does not fetch it again.
  Viewer-specific or paid data is requested in the
  browser from `/api/` via hooks and `usePublicAccess()`; it must never appear
  in server-rendered HTML. The one exception is `lib/adminAccess.ts`: it
  forwards the session cookie to a loopback-only Express origin to authorize
  admin documents, so it must not use the anonymous client.
- Anything every document needs goes into `app/layout.tsx`: search-engine
  verification, icons, theme color, the Plausible loader (it runs only on
  `hearthpulse.net`), the inline runtime switches and client wiring such as
  `ui/FieldFocusMode.tsx` and `ui/WebVitalsReporter.tsx`;
  `tests/next-document-head-browser.test.mjs` checks the rendered document.
- An entity page that cannot be verified must answer `503`, which a page
  component cannot do. `proxy.ts` reads the public projection of card, hero,
  library and cosmetics details and returns the retryable `503` document
  itself; an absent entity stays the page's own `404`. For cards, heroes and
  library cards it hands the projection to the page in a request header
  (`lib/publicProjectionHeader.ts`), so one request reads Express once.
- `app/error.tsx` catches errors of every route without its own boundary, so
  its copy names no section. Section-specific error copy belongs in that
  segment's `error.tsx` (`app/standard/cards/`, `app/articles/`,
  `app/contests/`). Every `error.tsx` renders inside the page shell and
  calls `ui/useRouteErrorRecovery.ts` with its own scope and copy. The hook
  posts the caught error once to `/api/telemetry/client-errors` (Express
  writes it to the journal as `[client-interface-error]` with the release,
  the route and, for a server render error, the `digest` that the Next.js log
  prints next to the full error) and returns the heading, the text, the
  button label and the action. A chunk that cannot load means the tab
  outlived a deploy, so every page then offers a full reload; any other error
  keeps the page's copy and the `retry` prop of Next.js, which fetches and
  renders the route again. The alert element carries `data-app-error`: the
  production observer and browser QA recognise an error page by it.
  `tests/next-error-boundary-browser.test.mjs` checks the copy, the marker,
  the report and the reload after a missing chunk.
- An error page must not need code that is loaded separately, or a missing
  chunk fails the error page too and Next.js replaces the document with its
  built-in "This page couldn't load" screen. Wrap a part of the page that a
  visitor can do without (the support prompt in the shell) in `OptionalSurface`
  from `src/components/OptionalSurface.tsx`: it renders nothing when that part
  fails and reports the failure. There is no custom `global-error.tsx`: it is
  part of the first load of every page and would cost about 1.8 KB of gzip
  JavaScript there. So when the shell itself throws, the error page fails
  with it and the visitor sees the built-in screen.
- Link to pages with their trailing slash (`/tierlist/`). The slash-less URL
  answers with an uncached 301, which costs a round trip per click and keeps
  the link out of prerendering. `navigate()` adds the slash for scripted
  navigation; an `href` has to carry it itself, written out or through
  `canonicalPagePath()` from `src/app/routing/canonicalPagePath.ts`. Modules
  under `src/modules/` may not import `src/app/`, so they write the slash out.
  `tests/next-canonical-links-browser.test.mjs` reads every link of the main
  pages, in the server HTML and after hydration, for a guest and a
  subscriber, and fails on a page URL without the slash.
- Public navigation sections are prerendered when a visitor hovers or presses
  a link; entity detail pages only fetch their HTML when pressed
  (`lib/speculationRules.ts`). A prerendered page's code
  can run for a visit that never happens. Anything that records a visit or
  changes state on load must wait for the `prerenderingchange` event, as
  `lib/analyticsLoader.ts` does; a URL that must not load early stays out of
  the rules. Links of the desktop sidebar also fetch their HTML on a 10 ms
  hover (a prefetch: no script runs, the request carries
  `Sec-Purpose: prefetch`), so a quick click is prerendered from that response.
  `tests/next-page-transitions-browser.test.mjs` checks the
  eligible URLs, the prefetch, the prerender and the transition. Browser QA
  (`scripts/e2e-qa.mjs`) starts Chromium with prerendering off, because a
  prerendered document loads outside its per-page `/api` mocks.
- The largest paint of most pages is a CSS background, which the browser
  finds only after every stylesheet. `PublicPageShell` therefore preloads the
  parchment page material (`--arena-parchment-texture`) at high priority; React
  sends the hint in the `Link` response header, or at the top of `<head>` for a
  prerendered page. A page whose measured phone LCP element is something else
  passes `parchmentPreload="tablet-up"`, which adds
  `media="(min-width: 768px)"`: from 768px the parchment is still the LCP
  there, below it phones skip the early fetch and load the file once from the
  CSS. These are text on `/tierlist/`, `/classes/` and `/legendaries/`, the
  site header on `/guides-archive/`, cosmetics images, and the banner art on
  `/standard/matchups/`, `/standard/archetypes/` and
  `/standard/vicious-gold/`, which also render `<PageBannerPreload />`.
  A preload on a page that paints something else first takes bandwidth from
  that element and the CSS. `tests/next-lcp-image-preload.test.mjs` checks
  both lists.
- Files in `public/` are served `immutable` for 30 days under names without a
  content hash: new bytes need a new file name (`arena-parchment-v2.webp`,
  `hsdisplay-2026-10.woff2`), never an overwrite. `assets.md` lists how each
  derived file was made.
- Gate paid pages with `PaywallGate` from `src/components/PaywallGate.tsx`.
  The production observer (`config/production-observer.json`) expects its
  `.arena-paywall` markup for guests. While `usePublicAccess()` is still
  checking, a full-page gate renders `PaywallPending`
  (`src/components/PaywallPending.tsx`): it reserves the gate's height
  (`--subscription-gate-min-height`), so the gate or the paid page replaces
  it without moving the footer, and it holds no data. Do not give it the
  `.arena-paywall` class, which QA reads as "the gate has rendered". Load a
  paid view that a guest never sees on demand, so guests download only the
  gate: `ui/lazyBattlegrounds.tsx` starts the download during the access
  check of a remembered session and renders a loaded view directly, without
  a Suspense boundary whose reveal throttle would delay it by about 300 ms,
  inside `.arena-paid-view`, which keeps the gate's height around the view's
  first render before its own data arrives.
  `tests/next-bundle-budgets.test.mjs` checks that the Battlegrounds routes do
  not load those views up front. A locked preview behind the gate keeps its
  loaders still (`PaywallGate.css`): give a loader a class, not an inline
  `animation` style, or it loops for the whole visit.
- Anonymous public documents send `Cache-Control: private, no-cache`
  (`documentCaching.mjs`, applied by `next.config.mjs` and, for `/`, by
  `proxy.ts`), so Back restores them from the back/forward cache instead of
  reloading them; every normal visit still revalidates, and no shared cache
  stores them. Add a new public route family there only if its server
  modules read no cookies (`tests/next-document-caching.test.mjs`); anything
  not listed keeps the header Next chooses (`no-store` on dynamic pages), as
  `/?login`, `/admin/`, `/deck-builder/`, `/archetypes/`, `/id/`,
  `/profiles/` and the `503` of `proxy.ts` do; Nginx forces `no-store` on the
  account and admin locations as well. A `404` or `500` inside a listed
  family carries the same header: it is never restored from the
  back/forward cache, but Back can show it from the HTTP cache until the
  visitor reloads. Every server answer about the viewer is recorded in this
  browser (`ui/restoredPageAccess.ts`); a restored page that shows another
  viewer than the last recorded one hides it and any paid view synchronously
  before it checks the session, and a re-check that cannot reach the server
  hides as well. A view that keeps viewer data must derive it from the
  current viewer in render, not in an effect. Plausible counts no new
  pageview for a restored page. The contract and its remaining gap are in
  `docs/specs/public-document-caching.md`;
  `tests/next-bfcache-browser.test.mjs` checks the headers, restores,
  sign-out and an account switch followed by Back. Production Nginx still
  adds `no-store` to `/` (see `docs/runbooks/nextjs-production-cutover.md`).
- `lib/authPrefetch.ts` starts `/api/auth/me` from the document head; the
  first `fetchCurrentAuthUser()` call adopts that response once, within ten
  seconds, and every later call fetches. A page that never checks the session
  wastes one small request.
- Titles, descriptions, indexing, canonical URLs and robots come from
  `src/shared/seo/publicRouteInventory.json` and
  `config/public-seo-pages.json`; do not hand-write them in a page. A registry
  page uses `seoPageMetadata()` (query-dependent robots),
  `seoStaticPageMetadata()` (prerendered pages and noindex pages) or, inside a
  custom `generateMetadata`, `seoRegistryMetadata()`. The gallery, the
  Battlegrounds library listings and the two builders still assemble the same
  registry values in their own helpers. `tests/next-seo-page-metadata.test.mjs`
  compares every registry page with the registry. Robots
  are `policy.robots` from `resolvePublicUrlPolicy()`, or `INDEXABLE_ROBOTS`
  (`src/shared/seo/robots.ts`) for a page that is always indexable: both
  carry the preview directives (`max-image-preview:large` and friends) that
  a bare `{ index: true }` drops.
- JSON-LD of listing and hub pages lives in
  `config/public-seo-structured-data.json`; the page renders it with
  `<SeoStructuredData path="/route" />` (`src/seo/structuredData.ts` adds
  canonical URLs, breadcrumb links and dataset dates). Entity pages (card,
  hero, library card, cosmetic) build their own.

## Add a public page

1. Register the URL policy in `src/shared/seo/publicRouteInventory.json` and
   the page in `config/public-seo-pages.json` (`"sitemap": true` when
   indexable, `false` for noindex pages). `seoPageMetadata()` fails when its
   module loads for an unregistered path. A page that ignores the query
   string and has no other request input uses `seoStaticPageMetadata()`
   instead and drops `dynamic`, so Next prerenders it.
2. Create `app/<route>/page.tsx`:

   ```tsx
   import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
   import { SomePageClient } from '@/apps/public-web/ui/SomePageClient';
   import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

   export const dynamic = 'force-dynamic';
   export const generateMetadata = seoPageMetadata('/some-route', 'Share alt');

   export default function Page() {
     return <>
       <SeoStructuredData path="/some-route" />
       <SomePageClient />
     </>;
   }
   ```

   Add the page's JSON-LD nodes to `config/public-seo-structured-data.json`
   when it is an indexable listing; omit `SeoStructuredData` otherwise.

3. Render content that needs no state, effects or handlers on the server:
   keep it out of `'use client'` modules and pass it as `children` to a small
   client shell, as `ui/PublicSupportPage.tsx` does with
   `ui/PublicSupportShell.tsx` for `/faq/`, `/privacy/` and `/terms/`. Its
   code and data then stay out of the browser bundle, but the rendered
   content also travels in the RSC payload of every HTML response instead
   of a cached chunk: `/faq/` lost 8.4 KiB of JavaScript and its document
   grew from 13.5 to 18.8 KiB gzip. No budget measures HTML. Links in it are
   plain anchors at canonical URLs: the browser loads the target as a
   document either way. Put interactive UI in
   `ui/SomePageClient.tsx` (`'use client'`), composed from the owning
   `src/modules/<domain>/public.ts`.
4. Route the URL to Next in `deploy/nginx/arena-html-routing.conf` and update
   `tests/nginx-html-routing.test.mjs`; add it to
   `apps/public-web/routeOwnership.mjs` so the local gateway and the Next test
   pilot route it to Next too. Activating an Nginx change in production
   follows `docs/runbooks/nextjs-production-cutover.md`. An anonymous public
   page of a new route family also goes into `documentCaching.mjs` and
   `tests/next-document-caching.test.mjs`.
5. Add `tests/next-<route>-browser.test.mjs` using
   `startPublicCardPilot({ pagesEnabled: true })` from
   `tests/helpers/publicCardPilot.mjs`, and register it in
   `tests/test-suites.json`.
6. Add the page template to `WEB_VITAL_ROUTE_TEMPLATES` in
   `shared/webVitalsDimensions.ts`; `tests/web-vitals-dimensions.test.ts`
   fails until the list matches the `app/` pages, and field Web Vitals would
   report the page as `other`.

## Commands

<!-- markdownlint-disable MD013 -->
| Command | Purpose |
| --- | --- |
| `npm run dev` | Express on port 3001, `next dev` on `127.0.0.1:4320` and the gateway on `http://localhost:3000` (pages, `/api`, files of `public/`, hot updates) |
| `npm run dev:next` | Only the Next dev server on `127.0.0.1:4320` |
| `npm run build:next` | Production build (required before Next browser tests) |
| `npm run lint:next` | TypeScript check of this app |
| `npm run agent:context -- apps/public-web` | Owner, routes, focused tests, docs and debt of this app |
| `npm run test:next-contracts` | Import, Express-client, search-param and navigation contracts |
| `npm run budget:next` | Gzip budgets of the initial JS and CSS per public route (`config/next-bundle-budgets.json`) |
| `node --test tests/next-<name>.test.mjs` | One Next test |
| `npm run verify:release` | Full release gate |
<!-- markdownlint-enable MD013 -->

`npm run dev` is the complete local site: open `http://localhost:3000`. The
gateway (`npm run dev:web`, `scripts/public-web-gateway.mjs`) sends pages and
`/_next/`, including the hot-update WebSocket, to `next dev`, serves the files
of `public/` itself and sends everything else to Express, as Nginx does in
production (see `docs/runbooks/nextjs-public-web.md`). Opening port 4320
directly gives pages without `/api` and without static files.

`next dev` rewrites `next-env.d.ts`, so that file is ignored by Git, and
`agentRules: false` in `next.config.mjs` stops it from writing its own
`AGENTS.md` and `CLAUDE.md` here. This version of Next.js differs from older
ones in routing, caching and configuration: check the bundled documentation in
`node_modules/next/dist/docs/` or Context7 before using an API from memory.

Browser tests reuse `apps/public-web/.next` and `dist/` when they exist, so
rebuild after changing source (`npm run build:next`, `npm run build:static`).

A browser test of a page runs on this runtime: `scripts/qa/nextRuntime.mjs`
with the QA fixture backend, or `tests/helpers/publicCardPilot.mjs` with the
Express fixture. A browser test of one component, or of a state that no page
can reach (two stacked dialogs, a page header without its page), opens a story
of the Storybook build through `tests/helpers/storybookStatic.mjs`; run
`npm run build-storybook` first. A story with the `fullPage` parameter renders
inside `<div id="root">`, as a page does in the layout, so dialogs isolate the
page behind them the same way. No test starts a development server, and every
browser test runs the production React: its development warnings (a missing
`key`, a state update during render) are not checked by these tests.

## Known debt

- Client-rendered wrappers around large legacy views (`src/features/*.tsx`);
  full-document navigation between pages. Prerendering and cross-document
  view transitions hide its cost in Chromium (the transition also runs in
  Safari 18.2+); Firefox still swaps documents without either.
- Legacy global CSS is imported per route from `src/`.
- `npm run qa:ci`, `verify:ci` and the nightly responsive QA run the browser
  QA against this app with the QA backend in `scripts/qa/`. Bundle budgets
  are `npm run budget:next`.
- Every page ships 149–214 KiB of gzip JavaScript and 30–62 KiB of CSS on
  first load. About 131 KiB of that JavaScript is React and the Next.js
  runtime, the same on every route; the rest is the hydrated legacy page
  shell and the route's own client components (measured on `/faq/` on
  2026-10-02). Server components remove only that rest: the help and legal
  pages went from 157.4 to 149.0 KiB. The budgets stop growth.
- The Vite application (`index.html`, `src/main.tsx`, `src/App.tsx` and its
  client router) is deleted. The Vite package stays as Storybook's bundler,
  configured in `.storybook/main.ts`; the owner decided on 2026-10-02 to keep
  it (see `docs/plans/nextjs-full-site-migration.md`).
