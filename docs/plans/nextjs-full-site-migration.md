# Full-site Next.js migration and Vite retirement

Status: proposed plan, 2026-09-24. The completed card pilot and its production
cutover are recorded in `nextjs-migration.md`, `nextjs-card-catalogs.md` and
`../runbooks/nextjs-production-cutover.md`. This plan starts from that deployed
state; it does not authorize another cutover by itself.

## Goal and boundary

Make the Next.js App Router the owner of every HearthPulse HTML page on
`hearthpulse.net`, including direct navigation, authenticated surfaces and
unknown-page responses. Retire Vite as a development, build, prerender,
Storybook and release dependency. Preserve the current public URL, query,
canonical, cookie, permission, API and visual contracts. Do not redesign pages
as part of the renderer migration.

This is a frontend migration, not a replacement of the Express data platform.
Express continues to own `/api/`, `/identity/`, health/metrics, server-side
authorization, persistence, subscriptions, image/data endpoints, sitemaps and
background jobs unless a separate decision changes an individual contract.
Next must not open a second database connection or invent a second login flow.
Nginx remains the public edge and routes each URL to exactly one owner.

## Verified starting point

- `apps/public-web/app` contains Next routes for the card catalog and detail,
  FAQ, privacy and terms. `apps/public-web/routeOwnership.mjs` limits the local
  pilot to these paths. Production Nginx sends those pages and `/_next/` to the
  Next service on port 4321.
- `npm run agent:context -- root` reports 47 public route patterns. The Nginx
  contract additionally has explicit `/admin/`, `/deck-builder/` and
  `/archetypes/` handling; the route inventory and effective Nginx map must be
  reconciled before using a route count as a completion metric.
- `src/app/routing/routeManifest.ts` and `src/shared/seo/publicRouteInventory.json`
  describe the legacy application surfaces and public URL policy. The current
  Vite application starts at `index.html`/`src/main.tsx` and composes routes in
  `src/App.tsx`. The release still runs `vite build`, `scripts/prerender.js`,
  `build:next` and `build:server`.
- `scripts/create-release.mjs` and `scripts/deploy-release.sh` require
  `dist/index.html`; Nginx serves legacy `/assets/`, prerendered HTML and the
  SPA fallback from `dist`. Storybook currently uses `@storybook/react-vite`.
  These are independent Vite retirement blockers even after all pages render
  in Next.

## Non-negotiable migration contract

1. Keep URL shape, trailing-slash redirects, query parameters, canonical and
   `noindex` decisions, status codes and historical redirects. The public URL
   inventory, Next route owner and Nginx dispatch must agree. Invalid detail
   URLs return a real 404, not an SPA 200.
2. Keep Express as the authority for sessions, CSRF, paid entitlements and
   admin permissions. Anonymous server-rendered HTML and hydration data contain
   only public facts. Private responses use per-request state and are never
   stored in a shared Next cache.
3. Reuse domain modules through narrow public contracts in the existing
   `app -> modules -> shared` direction. Browser-only code belongs in client
   components/adapters; server components do not import browser globals or the
   whole legacy application shell.
4. Keep a reversible Nginx owner change for each route family while Vite is
   present. Merge only after focused tests, build, browser review and a clean
   integration preflight. Commit each independently verified slice. Retain the
   previous release and rollback procedure when Vite is finally removed.

## Ordered work

### 0. Close the inventory and record the baseline

Build one route matrix from the public URL inventory, `routeManifest.ts`, the
effective Nginx config and access logs. Include `/admin/`, `/deck-builder/`,
`/archetypes/`, callbacks, removed URLs, redirects and unknown paths. For each
HTML route record its current owner, authenticated state, data source, SEO
policy, static asset dependencies, Next destination and focused test. Record
representative desktop/mobile screenshots and HTTP status/header fixtures for
public, signed-out, signed-in and forbidden states. Resolve the three explicit
Nginx routes missing from the 47-pattern count before declaring scope closed.

**Done when:** Every observed HTML URL has one recorded owner and expected
status; old and new route coverage can be compared mechanically. Verify with
`npm run test:route-inventory`, `npm run test:routes`,
`npm run test:nginx-routing` and sampled production access logs. Update
`docs/specs/application-route-manifest.md` and the migration matrix.

### 1. Make the Next application a reusable shell

Move page chrome, navigation, footer, global styles, error/not-found behavior,
metadata and providers into the Next composition layer. Keep domain behavior
in `src/modules/*`; avoid a catch-all shared module. Define adapters for
existing browser-only components, navigation/Back/Forward, runtime config and
authenticated API calls. Keep the current card pages working while doing this.
Record a route-by-route rendering choice: public SSR, request-scoped private
render, or client-only interaction after a safe shell. Do not globally force
static export or public caching.

**Done when:** A second route family can use the shell without importing
`src/App.tsx` or the Vite entry; card pages have unchanged behavior and CSS.
Verify `npm run build:next`, `npm run lint:next`, focused shell tests and
Storybook/browser review at 1440, 390 and 320 pixels. Update
`docs/architecture/module-boundaries.md` if ownership changes.

### 2. Move low-risk public and editorial pages

Move `/`, `/articles/`, `/gallery/`, `/guides-archive/` and its detail pages,
`/contests/` and `/developers/api/` in small vertical slices. FAQ, privacy and
terms already use Next: treat them as regression controls. For each slice,
implement the route, data/error states and metadata, then switch only its
Nginx owner. Preserve deep links, sitemap membership, redirects and links
between Next and legacy pages.

**Done when:** Each switched page has the same public behavior on direct load,
refresh and client navigation; canonical/robots metadata and 404s match the
baseline. Verify route and editorial tests, Next build, production monitor and
real-browser console/network/accessibility checks. Update the owning
`docs/specs/` contracts and `CHANGELOG.md` for shipped behavior.

### 3. Move read-only game-data route families

Move Arena (`/classes/`, `/tierlist/`, `/legendaries/`), constructed
(`/standard/matchups/`, `/standard/meta/`, `/standard/archetypes/`,
`/standard/vicious-gold/`, `/standard/fun-decks/`) and Battlegrounds
(`/heroes/`, `/library/`, `/cosmetics/`, `/battlegrounds/tier-list/`) with
their inventory-listed detail/format/archive variants. Split by domain and
then by list/detail where needed; do not bundle all game-data pages into one
commit. Keep loading, empty, stale, error and retry states distinct. Use
existing Express read models and module policies rather than server-importing
client hooks. Sample live sitemap detail IDs and authoritative missing IDs.

**Done when:** Every route variant, query filter, SEO response, public/private
statistic boundary and image path passes its focused contract test and browser
journey. Verify the relevant `test:*` domain suites, `test:prerender-seo`
equivalent Next checks, Next build and production monitor after each switch.

### 4. Move interactive and legacy-script surfaces

Move `/battlegrounds/strategies/`, `/battlegrounds/tier-builder/`,
`/deck-builder/` and the explicit `/archetypes/` family. First map the
`public/bg-legacy` scripts and static asset URLs they actually load. Wrap or
port each interaction inside a client-only domain boundary; do not execute
browser globals during server render. Preserve saved state, deep links,
exports/imports and any legacy redirects. Keep old static assets available
until access logs and page checks show they are no longer needed.

**Done when:** Creation/edit/export flows and direct links work in a real
browser on desktop and mobile without hydration or console errors. Verify
focused builder tests, Next build and representative browser flows.

### 5. Move identity, subscription and administration surfaces

Move public profiles (`/id/`, `/profiles/`), `/connect/`, account/login
overlays, subscription gates and `/admin/` after the shared session adapter is
proven. Preserve OAuth/identity callback ownership in Express. Server-side
decisions about private data use the existing account/entitlement endpoints;
client navigation must revalidate changed sessions and blocked accounts.
Admin pages must not leak privileged data in HTML, hydration state or cache.
Keep this work in separate identity, subscription and admin commits.

**Done when:** Signed-out, active, expired, blocked, unsubscribed and admin
states match the current permission contract; callback, CSRF and logout flows
still work. Verify the existing auth/subscription/admin focused suites and
real-backend browser journeys with controlled test accounts before switching
each owner. Update permission specs and operational runbooks.

### 6. Switch the remaining HTML and prove 100% Next ownership

Route all remaining GET/HEAD HTML, including unknown paths, to Next. Keep
Express-only locations for APIs, callbacks, uploads, sitemaps, health, metrics,
redirects and data/image endpoints. Compare the effective Nginx map with the
route matrix, not just the checked-in snippet. Run production canaries and
monitor exact release SHA, HTTP 200/301/404/500 distribution, login and paid
access, console/network failures and Core Web Vitals. Roll back the affected
Nginx owner rule if a family regresses.

**Done when:** Every active HTML route is owned by Next and the legacy Vite
artifact receives zero HTML requests over an agreed observation window; all
required browser and release checks pass. Keep the legacy artifact available
for one rollback window before removing it from the build.

### 7. Remove Vite from tooling and releases

Replace Vite-dependent Storybook framework/types with a verified non-Vite
builder (evaluate `@storybook/react-webpack5` with the existing MCP addon and
stories first). Replace `import.meta.env`/`VITE_*` in authored client code with
explicit Next-safe configuration; preserve opt-in Sentry privacy defaults.
Move required `public/` assets into a Next/Nginx serving contract without URL
changes. Replace Vite `index.html`, `vite.config.ts`, `src/vite-env.d.ts`,
`scripts/prerender.js`, `dist` assumptions, preview/dev scripts, CI gates,
release manifest/checksums and deploy rollback checks. Remove direct Vite,
`@vitejs/plugin-react`, `@tailwindcss/vite` and `@storybook/react-vite`
dependencies only after the replacement checks pass; update the lockfile.
Do not delete still-requested `/assets/` URLs or historical rollback artifacts.

**Done when:** `npm run dev`, `npm run build`, Storybook/MCP, release creation,
deployment and rollback use Next plus Express without a Vite build. No active
source/config/deploy script depends on Vite or `dist/index.html`; dependency
inspection finds no Vite tooling needed by the site. Verify `npm run
verify:release`, `npm run test:storybook`, `npm run build-storybook`,
`npm run test:server-build`, `npm run test:recovery-runtime`, release artifact
and Nginx contract tests, followed by a production monitor and browser smoke
check. Update `DEPLOYMENT.md`, `README.md`, `docs/runbooks/nextjs-public-web.md`,
`docs/runbooks/nextjs-production-cutover.md` and the release/rollback runbook.

## Release discipline and risks

Each slice uses its own `codex/` branch/worktree, session preflight, focused
red/green tests, changed-file Semgrep, browser QA for visible changes, one
verified commit and integration preflight. Fast-forward-safe integration to
`main` is the only production trigger; verify the deployed SHA. Full registry,
Next/Storybook builds and release checks run at phase checkpoints. Record the
route owner and a one-rule rollback path for every production switch.

The highest risks are private-data caching across sessions, OAuth/cookie
regressions, dynamic routes accidentally returning 200 for missing content,
legacy script hydration errors, and removal of assets or `dist` before release
rollback no longer needs them. The gates above target these specific failures.
`htmlLimitedBots` and the existing Webpack compatibility rule stay until
status/metadata behavior and the vendored UMD dependency are proven under any
replacement build path.

Final acceptance is **all HTML on Next, Express contracts preserved, no Vite
runtime/build/Storybook requirement, clean release rollback, and the route
matrix plus production monitor passing for the deployed SHA**. An Express
replacement would be a separate, larger backend migration with its own spec.

## Documentation impact during execution

Update `docs/specs/` with route/permission changes, `docs/architecture/` when
module ownership changes, `docs/runbooks/` for Nginx/build/deploy/rollback,
and `CHANGELOG.md` when user-visible behavior ships. Keep the pilot ADR as a
historical record; write a new ADR if the final asset, caching or deployment
architecture materially differs from this proposal. Historical plans may
describe earlier states, but current runbooks and route contracts must reflect
the active owner after every release.

## References

- [Next.js migration from Vite](https://nextjs.org/docs/app/guides/migrating/from-vite)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Storybook React with Webpack](https://storybook.js.org/docs/get-started/frameworks/react-webpack5)
