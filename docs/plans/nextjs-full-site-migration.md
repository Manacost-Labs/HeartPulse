# Full-site Next.js migration and Vite retirement

Status: execution in progress, 2026-09-25. Thirty-two of the 47 inventory
entries are served by Next.js, including public/editorial pages, Arena and
constructed catalogs, the guide archive, archetype details and the Battlegrounds
hero catalog, library listings, hero details and all supported library card details.
The remaining route checklist is the
[coverage ledger](nextjs-route-coverage.md). The card pilot and production
cutover are recorded in `nextjs-migration.md`, `nextjs-card-catalogs.md` and
`../runbooks/nextjs-production-cutover.md`.

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
  gallery, FAQ, privacy and terms. Production Nginx sends these seven
  inventory patterns and `/_next/` to the Next service on port 4321.
- At the 2026-09-24 baseline, `npm run agent:context -- root` reported 47
  public route patterns: seven live on Next, 36 other active HTML patterns and
  four redirect/removed/fallback contracts. The
  [coverage ledger](nextjs-route-coverage.md) tracks their current owners.
  Nginx also has explicit `/deck-builder/` and `/archetypes/` pages outside
  that inventory; `/admin/` is listed but has a separate exact edge rule.
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
- The public shell links to `/profile/`, which currently returns 404. Decide
  its account destination and fix that path or link before final URL closure.

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

## Remaining execution queue (2026-09-25)

The [coverage ledger](nextjs-route-coverage.md) is the exhaustive route list;
the following queue turns its 15 remaining entries and two additional HTML
pages into independently releasable slices. Each slice ends with a focused
HTTP/permission test, Next build, direct-port browser review, a commit, a
separate Nginx owner switch, and verification of the deployed SHA. A Next route
alone does not close a ledger row.

1. Move `/cosmetics`, `/cosmetics/:kind` and
   `/cosmetics/:kind/:cardId`. Match public data, permissions, images, SEO,
   filters, 404 and 5xx responses. The listing routes are staged in Next.js;
   detail routes and the public Nginx owner switch remain.
2. Move `/battlegrounds/tier-list`. Keep public teaser and paid data separate;
   verify source/filter state and empty/error views after refresh.
3. Move `/battlegrounds/strategies` and `/battlegrounds/tier-builder`.
   Verify saved state, imports/exports, client interactions and legacy assets.
4. Move `/archetypes/wild`, `/archetypes/` and `/deck-builder/`.
   Check direct load, editing, authentication and `noindex`; record the latter
   two explicit Nginx pages in the reconciled inventory.
5. Move `/connect`, `/id/:publicProfileId` and
   `/profiles/:legacyPublicProfileId`. Keep identity and serializer APIs as
   authority; check signed-out, linked, missing and legacy states. Fix the
   broken `/profile/` shell link.
6. Move `/admin`. Check permission at the server boundary and verify guest,
   forbidden and administrator responses and operations tabs. No privileged
   data may enter shared HTML.
7. Close `/r/:slug`, `/decks/:path*`, `/jobs/:path*` and unknown `/:path*`.
   Preserve redirect and removed statuses, return a real Next 404 for unknown
   HTML, and replace the Vite-generated `/404.html`. These are contracts,
   not four new content pages.

After slice 7, reconcile the effective Nginx rules, route manifest, sitemap,
SEO inventory and sampled access logs. The gate for beginning Vite removal is
**47 of 47 ledger entries resolved, both extra admin tools resolved, and zero
new HTML served from Vite for seven consecutive days**. Keep `/api/`,
`/identity/`, health, metrics, sitemaps and media on their established owners.
Preserve the Yandex verification URL as a static-asset contract.

Retire Vite in four independently committed tooling slices: (a) replace
development/preview and Storybook's Vite framework, (b) replace Vite env reads,
prerender/SEO and bundle-budget checks, (c) make release, Nginx, CDN and
rollback artifacts Next-only while retaining old hashed assets for their
carry-forward window, then (d) remove the Vite entry/config/dependencies and
prove `npm ls vite --all` plus active source/config searches are clear. The
final gate is `npm run dev`, `npm run build`, Storybook, release creation,
deployment and rollback working without a Vite artifact; production HTML and
current assets must no longer depend on `dist`.

## Ordered work

### 0. Close the inventory and record the baseline

Use the [47-entry ledger](nextjs-route-coverage.md) as the initial matrix,
then reconcile it with `routeManifest.ts`, the **effective** Nginx config and
access logs. Include `/admin/`, `/deck-builder/`, `/archetypes/`, the broken
`/profile/` link, callbacks, removed URLs, redirects and unknown paths. For
each HTML route record its current owner, authenticated state, data source,
SEO policy, static asset dependencies, Next destination and focused test. Record
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

Progress: the gallery already reuses the public shell. Shared session,
navigation and error adapters still need proof against gated and editable
pages before this foundation is considered complete.

### 2. Move low-risk public and editorial pages

The home presentation now has a public module contract shared with the legacy
route. Its request-time Next route uses anonymous Express data and preserves
`/?login`; Nginx ownership changes only after direct-port and browser checks.

Move `/articles/`, `/developers/api/`, `/contests/` and `/` in separate public
slices. Gallery, FAQ, privacy and terms already use Next: treat them as
regression controls. Move `/guides-archive/` and
`/guides-archive/:guideSlug/` only after the request-scoped entitlement
adapter can distinguish public teaser, subscribed content, expired access and
missing guide. For each slice, implement the route, data/error states and
metadata, then switch only its Nginx owner. Preserve deep links, sitemap
membership, redirects and links between Next and legacy pages.

**Done when:** Each switched page has the same public behavior on direct load,
refresh and client navigation; canonical/robots metadata and 404s match the
baseline. Verify route and editorial tests, Next build, production monitor and
real-browser console/network/accessibility checks. Update the owning
`docs/specs/` contracts and `CHANGELOG.md` for shipped behavior.

Progress (2026-09-24): `/gallery/` is live in production. Its Next route
server-renders the anonymous `/api/gallery` projection with request-time
fetching; Express still owns the API and media URLs. CI, the route monitor and
desktop/mobile browser checks passed for the deployed cutover.

Progress (2026-09-24): `/developers/api/` now has a static Next route using the
existing developer API module and public shell. The Nginx owner and local
gateway both route it to Next; API endpoints remain on Express. Direct-load
metadata, desktop/mobile layout, console and network behavior were checked
before integration.

Progress (2026-09-24): `/articles/` now has a request-time Next route with an
anonymous Express projection. The article UI moved into its own module;
personal votes and VIP access stay behind the existing Express API. Production
Nginx routes the page to Next after direct-port and browser checks. Query
filters remain `noindex, follow`; error responses are `noindex, nofollow`.
The Vite compatibility route owns a combined legacy stylesheet. Its temporary
startup gzip ceiling is 82,112 bytes after CI measured up to 81,924 bytes of
hashed-chunk variance; the ceiling will be removed with Vite.

Progress (2026-09-24): `/contests/` now has a request-time Next route with an
anonymous public projection. The public UI is separated from the administrator
workspace; participation and subscription checks remain on Express. Production
Nginx routes the page to Next after direct-port and browser checks.
The 82,112-byte Vite startup gzip cap also covers contest chunk-hash variance;
the measured uncompressed startup bundle is 261,064 bytes and the cap disappears
with Vite retirement.

### 3. Move read-only game-data route families

Progress (2026-09-24): `/classes/` has a Next route with an anonymous
server-rendered teaser and the existing account-scoped statistics client.
After direct-port and browser checks on the deployed release, Nginx serves
this page from Next.js. `/tierlist/` also has a Next route with account-gated
client data loading and an anonymous server-rendered page. Its public Nginx
owner switches to Next.js after the deployed direct-port check. `/legendaries/`
now has a Next route with the same anonymous teaser and an account-scoped
client data loader. After deployed direct-port and browser checks, public Nginx
serves it from Next.js.

Progress (2026-09-25): `/standard/matchups/` has a Next route with an
anonymous teaser, a subscription-gated controlled view and an account-scoped
client cache. After direct-port and browser checks on the deployed release,
Nginx serves the page from Next.js.
`/standard/meta/` also serves a public teaser from Next.js, loads full
statistics only after entitlement verification, and clears full data when the
API revokes access. Its Nginx owner switched after direct-port and browser
checks on the deployed release.
`/standard/fun-decks/` also uses Next.js after direct-port and browser checks.
The `/standard/archetypes/` catalog is served by Next.js after deployed
direct-port and browser verification. Its guest teaser, subscriber and
administrator access, and query filters remain intact. Detail URLs use Next.js
after separate deployment and browser verification.
It preserves the current public dataset API and client-side three-deck preview.
Both archetype detail URL families are staged in Next.js using anonymous
teaser data for server HTML, request-time 404 checks and account-scoped full
data after hydration. Their public Nginx owner switched after deployed browser
verification.
The guides archive listing uses Next.js. Its public title
and description render without a session; the existing protected list API is
called only after a guides-archive entitlement or administrator role is
verified. Its public Nginx owner switched after deployed browser checks.
Individual guide pages also use Next.js. A new anonymous Express
teaser supplies a title and excerpt for request-time HTML, while the existing
full-content API remains behind the guides-archive entitlement. Missing guides
return 404 and numeric old links canonicalize to their resolved slugs. Nginx
ownership switched after a deployed browser check.
The `/heroes/` Battlegrounds list uses Next.js. Guests receive a
public description; the existing hero statistics client mounts only after
`battlegrounds` entitlement or administrator access is verified. Detail hero
URLs use Next.js with anonymous identity, protected statistics, real missing-ID
responses and retryable 503 responses on catalog outages. Their public Nginx
owner switched after deployed direct-port and browser checks.
The `/library/` listing uses Next.js with a public HTML description. Its existing
card filters and statistics mount only after Battlegrounds entitlement or
administrator access is verified.
All inventory-listed `/library/:kind/` and `/library/archive/:kind/` categories
use Next.js, including anomaly, quest, reward, prize and trinket variants.
Unsupported archive categories return 404. Minion and spell card details are
served by Next.js with anonymous identity, canonical links, real missing-card
404s and retryable 503 responses. Their public owner switched after deployed
direct-port and browser checks.
Additional and archive card details remain with the legacy renderer until
their own URL and data contracts are checked.
`/standard/vicious-gold/` serves a public description from Next.js. Its
protected summary and builds requests begin only after standard entitlement or
administrator access is verified. Nginx switched after direct-port and browser
checks on the deployed release.

Move Arena (`/classes/`, `/tierlist/`, `/legendaries/`), constructed
(`/standard/matchups/`, `/standard/meta/`, `/standard/archetypes/`,
`/standard/vicious-gold/`, `/standard/fun-decks/`) and Battlegrounds
(`/heroes/`, `/library/`, `/cosmetics/`, `/battlegrounds/tier-list/`) with
their inventory-listed detail/format/archive variants. Split by domain and
then by list/detail where needed: Arena first, constructed listings before
their archetype and legacy-meta details, then Battlegrounds listings before
heroes, cosmetics and library details. Do not bundle all game-data pages into
one commit. Keep loading, empty, stale, error and retry states distinct. Use
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
until access logs and page checks show they are no longer needed. The
`/archetypes/wild/` inventory route and the `/archetypes/` root must both be
covered; neither can rely on a broad SPA fallback.

**Done when:** Creation/edit/export flows and direct links work in a real
browser on desktop and mobile without hydration or console errors. Verify
focused builder tests, Next build and representative browser flows.

### 5. Move identity, subscription and administration surfaces

Move public profiles (`/id/`, `/profiles/`), `/connect/`, account/login
overlays, subscription gates and `/admin/` after the shared session adapter is
proven. Resolve the `/profile/` link that currently returns 404, and keep
`/?login` query and robots behavior. Preserve OAuth/identity callback
ownership in Express. Server-side decisions about private data use the
existing account/entitlement endpoints;
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
route matrix, not just the checked-in snippet. Replace the Vite-produced
internal `/404.html` document with a Next 404 for unknown HTML and an
independent emergency error response for technical paths. Preserve the Yandex
verification file as a static asset. Record the selected HTML owner in bounded
origin access logs before the final switch so Vite traffic can be measured.
Run production canaries and monitor exact release SHA, HTTP 200/301/404/500
distribution, login, paid access, console/network failures and Core Web Vitals.
Roll back the affected Nginx owner rule if a family regresses.

**Done when:** Every active HTML route is owned by Next and origin access logs
show zero HTML served from the Vite artifact for seven consecutive days; all
required browser and release checks pass. Keep the legacy artifact available
for one rollback window before removing it from the build, and retain old
hashed assets through the existing 35-day carry-forward window.

### 7. Remove Vite from tooling and releases

Replace Vite-dependent Storybook framework/types with a verified non-Vite
builder (evaluate `@storybook/react-webpack5` and the Next.js Webpack
framework with the existing MCP addon and stories first). Replace
`import.meta.env`/`VITE_*` in authored client code with explicit Next-safe
configuration; preserve opt-in Sentry privacy defaults.
Move required `public/` assets into a Next/Nginx serving contract without URL
changes. Replace Vite `index.html`, `src/main.tsx`, `vite.config.ts`,
`src/vite-env.d.ts`, `scripts/prerender.js`, `dist` assumptions, preview/dev
scripts, CI gates,
release manifest/checksums and deploy rollback checks. Remove direct Vite,
`@vitejs/plugin-react`, `@tailwindcss/vite` and `@storybook/react-vite`
dependencies only after the replacement checks pass; update the lockfile.
Do not delete still-requested `/assets/` URLs or historical rollback artifacts.

Retire each Vite dependency at its actual owner, in this order:

1. Make `package.json` development, build and preview scripts start Next plus
   Express. Keep `apps/public-web/postcss.config.mjs` as the Tailwind pipeline;
   remove the separate Vite plugin only after Storybook no longer needs it.
2. Replace `.storybook/main.ts` and its framework types, verify every story
   and the local Storybook MCP, then update the Storybook contract test. The
   non-Vite builder must work with existing addons and React components before
   `@storybook/react-vite` is removed.
3. Replace Vite environment reads in `src/telemetry/sentry.ts`,
   `src/telemetry/webVitals.ts`, `src/components/AppErrorBoundary.tsx` and
   `src/app/shell/installFieldFocusMode.ts`. Preserve the current privacy,
   disabled-by-default telemetry and runtime-config behavior.
4. Replace `scripts/prerender.js` and `test:prerender-seo` with Next route and
   metadata/status tests. Move bundle checks from `dist/.vite/manifest.json`
   in `scripts/check-budgets.js` to the Next build output. Update local browser
   QA scripts and their error-overlay checks to run against Next.
5. Move URLs currently served from Vite `dist` into a reviewed Next/Nginx
   asset contract. Update `deploy/nginx/arena-html-routing.conf`,
   `arena-cdn-public-static.conf`, `deploy/activate-arena-static.sh`,
   `deploy/monitor-arena-geodns.sh` and `deploy/nginx-paths.conf.example` as
   their real dependencies require. Retain old hashed `/assets/` files for the
   CDN and rollback window; preserve the Yandex verification URL.
6. Make release creation, checksums, the CI artifact, the deployer and rollback
   accept a Next-only HTML artifact. Remove their `dist/index.html` requirement
   only after the deployed N and N-1 releases are compatible with the new
   Nginx contract. Validate the real origin and edge role files before rollout.
7. Remove `index.html`, `src/main.tsx`, `vite.config.ts`,
   `src/vite-env.d.ts`, direct Vite packages and obsolete scripts. Drain and
   delete `src/App.tsx` only after its remaining route behavior has a module
   owner. Regenerate `package-lock.json`. Audit
   active source, scripts, tests, CI and package-lock for remaining Vite
   references; keep historical documents and immutable old releases only as
   records or rollback artifacts.

**Done when:** `npm run dev`, `npm run build`, Storybook/MCP, release creation,
deployment and rollback use Next plus Express without a Vite build. No active
source/config/deploy script depends on Vite or `dist/index.html`; dependency
inspection finds no Vite tooling needed by the site. Verify `npm run
verify:release`, `npm run test:storybook`, `npm run build-storybook`,
`npm run test:server-build`, `npm run test:recovery-runtime`, release artifact
and Nginx contract tests, followed by a production monitor and browser smoke
check. Update `DEPLOYMENT.md`, `README.md`, `docs/runbooks/nextjs-public-web.md`,
`docs/runbooks/nextjs-production-cutover.md` and the release/rollback runbook.
`npm ls vite --all` and a lockfile inspection must show no active Vite package;
production must serve zero HTML or current assets from a Vite `dist` artifact.

## Release discipline and risks

Each slice uses its own `codex/` branch/worktree, session preflight, focused
red/green tests, changed-file Semgrep, browser QA for visible changes, commits
after each verified step and integration preflight. Fast-forward-safe
integration to `main` is the only production trigger; verify the deployed
SHA. Full registry,
Next/Storybook builds and release checks run at phase checkpoints. Record the
route owner and a one-rule rollback path for every production switch. Commit
the page/data contract before its edge switch. Deploy the Next page behind the
old Nginx owner, verify its direct response, then install the reviewed Nginx
rule and release its exact versioned contract hash. Keep the old owner usable
until this sequence passes.

For each row in the [coverage ledger](nextjs-route-coverage.md), record one
evidence line: direct URL and refresh status, canonical and robots policy,
public/private payload boundary, relevant 301/404/5xx behavior, desktop and
mobile browser result, owning test, deployed SHA and rollback rule. Check
representative signed-out, subscribed, expired, blocked and admin states where
the route has an entitlement. Test a real missing ID for each detail family.

The highest risks are private-data caching across sessions, OAuth/cookie
regressions, dynamic routes accidentally returning 200 for missing content,
legacy script hydration errors, and removal of assets or `dist` before release
rollback no longer needs them. The gates above target these specific failures.
`htmlLimitedBots` and the existing Webpack compatibility rule stay until
status/metadata behavior and the vendored UMD dependency are proven under any
replacement build path.

Final acceptance is **all active HTML on Next, Express contracts preserved,
all 47 inventory entries and the two extra admin-tool pages accounted for,
unknown HTML returning a real Next 404, no Vite runtime/build/Storybook
requirement, clean release rollback, and the route matrix plus production
monitor passing for the deployed SHA**. Replacing Express would be a separate
backend migration with its own spec.

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
- [Storybook Next.js framework](https://storybook.js.org/docs/get-started/frameworks/nextjs)
