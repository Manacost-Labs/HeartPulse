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
| `app/<route>/page.tsx` | URL, metadata, anonymous server-side data, then one client page component |
| `app/layout.tsx`, `app/not-found.tsx`, `app/error.tsx` | Document shell with the site-wide head tags, analytics script and field focus mode; real 404 and the generic error page for every route |
| `ui/*PageClient.tsx` | Client page: viewer access, data hooks and the legacy view inside `PublicPageShell` |
| `ui/usePublicAccess.ts` | Browser session, subscription and admin state for the viewer |
| `ui/navigation.ts` | `navigate()` and `navigateTab()` (full-document navigation to the canonical trailing-slash URL) |
| `app/page-transitions.css` | Opt-in to cross-document view transitions; the animation itself is the `route-content` block of `src/index.css` |
| `lib/speculationRules.ts` | Which links Chromium prerenders on hover or press |
| `lib/analyticsLoader.ts` | Inline Plausible loader: canonical host only, after a prerendered page is opened |
| `lib/expressApi.ts` | `fetchPublicExpress()`: anonymous server reads of Express `/api/` paths |
| `lib/seoPageMetadata.ts` | Metadata of pages in `config/public-seo-pages.json` |
| `lib/public*.ts` | Server-only loaders that validate public Express projections |
| `lib/runtimeClientConfig.ts` | Root-managed runtime switches (card-image CDN) for server rendering and the inline document config |
| `proxy.ts` | Request proxy for card, hero, library and cosmetics detail probes |
<!-- markdownlint-enable MD013 -->

## Rules

- Import siblings with `./`; import everything else as `@/<repository path>`
  (for example `@/src/modules/subscriptions/public`). Never `../`, never
  `server/`. `tests/next-import-paths.test.mjs` enforces this.
- Server components fetch only anonymous public projections through
  `fetchPublicExpress()`. Viewer-specific or paid data is requested in the
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
  `app/contests/`); `tests/next-error-boundary-browser.test.mjs` checks both.
- Link to pages with their trailing slash (`/tierlist/`). The slash-less URL
  answers with an uncached 301, which costs a round trip per click and keeps
  the link out of prerendering. `navigate()` adds the slash for scripted
  navigation; an `href` has to carry it itself, written out or through
  `canonicalPagePath()` from `src/app/routing/canonicalPagePath.ts`.
- Public navigation sections and their detail pages are prerendered when a
  visitor hovers or presses a link (`lib/speculationRules.ts`), so page code
  can run for a visit that never happens. Anything that records a visit or
  changes state on load must wait for the `prerenderingchange` event, as
  `lib/analyticsLoader.ts` does; a URL that must not load early stays out of
  the rules. `tests/next-page-transitions-browser.test.mjs` checks the
  eligible URLs, the prerender and the transition. Browser QA
  (`scripts/e2e-qa.mjs`) starts Chromium with prerendering off, because a
  prerendered document loads outside its per-page `/api` mocks.
- Gate paid pages with `PaywallGate` from `src/components/PaywallGate.tsx`.
  The production observer (`config/production-observer.json`) expects its
  `.arena-paywall` markup for guests.
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

3. Put interactive UI in `ui/SomePageClient.tsx` (`'use client'`), composed
   from the owning `src/modules/<domain>/public.ts`.
4. Route the URL to Next in `deploy/nginx/arena-html-routing.conf` and update
   `tests/nginx-html-routing.test.mjs`; add it to
   `apps/public-web/routeOwnership.mjs` so the local gateway and the Next test
   pilot route it to Next too. Activating an Nginx change in production
   follows `docs/runbooks/nextjs-production-cutover.md`.
5. Add `tests/next-<route>-browser.test.mjs` using
   `startPublicCardPilot({ pagesEnabled: true })` from
   `tests/helpers/publicCardPilot.mjs`, and register it in
   `tests/test-suites.json`.

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

## Known debt

- Client-rendered wrappers around large legacy views (`src/features/*.tsx`);
  full-document navigation between pages. Prerendering and cross-document
  view transitions hide its cost in Chromium (the transition also runs in
  Safari 18.2+); Firefox still swaps documents without either.
- Links written by hand inside legacy views (home hero, related links, card
  and cosmetics listings) still omit the trailing slash: a click handler
  fixes the URL, but those links are not prerendered and a plain anchor
  still pays the redirect.
- Legacy global CSS is imported per route from `src/`.
- `npm run qa:ci`, `verify:ci` and the nightly responsive QA run the browser
  QA against this app with the QA backend in `scripts/qa/`. Bundle budgets
  are `npm run budget:next`.
- Every page ships about 150–210 KiB of gzip JavaScript and 50–70 KiB of CSS
  on first load, because each renders the legacy client shell; the budgets
  only stop that from growing.
- The Vite application (`index.html`, `src/main.tsx`, `src/App.tsx` and its
  client router) is deleted. The Vite package stays only for Storybook and
  eleven component-harness browser tests (see
  `docs/plans/nextjs-full-site-migration.md`).
