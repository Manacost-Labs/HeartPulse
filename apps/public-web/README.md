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
| `ui/navigation.ts` | `navigate()` and `navigateTab()` (full-document navigation) |
| `lib/expressApi.ts` | `fetchPublicExpress()`: anonymous server reads of Express `/api/` paths |
| `lib/seoPageMetadata.ts` | Metadata of pages in `config/public-seo-pages.json` |
| `lib/public*.ts` | Server-only loaders that validate public Express projections |
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
  `hearthpulse.net`) and client wiring such as `ui/FieldFocusMode.tsx`. The
  legacy `index.html` and `src/main.tsx` no longer reach production;
  `tests/next-document-head-browser.test.mjs` checks the rendered document.
- `app/error.tsx` catches errors of every route without its own boundary, so
  its copy names no section. Section-specific error copy belongs in that
  segment's `error.tsx` (`app/standard/cards/`, `app/articles/`,
  `app/contests/`); `tests/next-error-boundary-browser.test.mjs` checks both.
- Gate paid pages with `PaywallGate` from `src/components/PaywallGate.tsx`.
  The production observer (`config/production-observer.json`) expects its
  `.arena-paywall` markup for guests.
- Indexing, canonical URLs and robots come from
  `src/shared/seo/publicRouteInventory.json` and
  `config/public-seo-pages.json`; do not hand-write them in a page.

## Add a public page

1. Register the URL policy in `src/shared/seo/publicRouteInventory.json` and
   the page in `config/public-seo-pages.json` (`"sitemap": true` when
   indexable, `false` for noindex pages). `seoPageMetadata()` fails when its
   module loads for an unregistered path.
2. Create `app/<route>/page.tsx`:

   ```tsx
   import { SomePageClient } from '@/apps/public-web/ui/SomePageClient';
   import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

   export const dynamic = 'force-dynamic';
   export const generateMetadata = seoPageMetadata('/some-route', 'Share alt');

   export default function Page() {
     return <SomePageClient />;
   }
   ```

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
| `npm run dev` | Legacy Vite dev server on port 3000 (serves `public/`, proxies `/api`) and Express on port 3001 |
| `npm run dev:next` | Next dev server on `127.0.0.1:4320` |
| `npm run build:next` | Production build (required before Next browser tests) |
| `npm run lint:next` | TypeScript check of this app |
| `npm run agent:context -- apps/public-web` | Owner, routes, focused tests, docs and debt of this app |
| `npm run test:next-contracts` | Import, Express-client, search-param and navigation contracts |
| `npm run budget:next` | Gzip budgets of the initial JS and CSS per public route (`config/next-bundle-budgets.json`) |
| `node --test tests/next-<name>.test.mjs` | One Next test |
| `npm run verify:release` | Full release gate |
<!-- markdownlint-enable MD013 -->

For complete local navigation with `/api` and static files, run `npm run dev`
and `npm run dev:next`, then the gateway on `127.0.0.1:4317` with the Vite dev
server as its legacy origin (see `docs/runbooks/nextjs-public-web.md`):

```bash
LEGACY_WEB_ORIGIN=http://127.0.0.1:3000 PUBLIC_CARDS_NEXT_ENABLED=1 \
  PUBLIC_PAGES_NEXT_ENABLED=1 PUBLIC_GALLERY_NEXT_ENABLED=1 \
  npm run dev:public-gateway
```

Browser tests reuse `apps/public-web/.next` and `dist/` when they exist, so
rebuild after changing source (`npm run build:next`, `npm run build`).

## Known debt

- Client-rendered wrappers around large legacy views (`src/features/*.tsx`);
  full-document navigation between pages.
- Legacy global CSS is imported per route from `src/`.
- `npm run qa:ci`, `verify:ci` and the nightly responsive QA run the browser
  QA against this app with the QA backend in `scripts/qa/`;
  `npm run qa:legacy` still covers the Vite build until it is retired (see
  `docs/plans/nextjs-full-site-migration.md`). Bundle
  budgets for this app are `npm run budget:next`; `npm run budget` still
  checks the legacy Vite bundle.
- Every page ships about 150–210 KiB of gzip JavaScript and 50–70 KiB of CSS
  on first load, because each renders the legacy client shell; the budgets
  only stop that from growing.
- The Vite build, `src/main.tsx` and `src/App.tsx` stay until the retirement
  gate in the same plan.
