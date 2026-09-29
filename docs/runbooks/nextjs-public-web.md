# Local Next.js public web development

Production Nginx sends every public HTML page to Next.js; see
[the production cutover runbook](nextjs-production-cutover.md) and
[the route coverage ledger](../plans/nextjs-route-coverage.md). The commands
below run the app locally for development and QA only. No service, Nginx
configuration, live data or release is changed by them. Work from an isolated
repository checkout. The app's structure and rules are in
[`apps/public-web/README.md`](../../apps/public-web/README.md).

1. Install locked dependencies with `npm ci`.
2. Run `npm run dev`: Express on port 3001 (set `HOST=127.0.0.1` to keep it
   on loopback) and the legacy Vite dev server on port 3000, which serves
   `public/` and proxies `/api` to Express. For QA, start Express with an
   isolated environment and temporary database as described by
   `tests/helpers/credentialBackend.mjs` instead. Never source the production
   environment for QA.
3. Run `npm run dev:next` (loopback port 4320), or `npm run build:next` then
   `npm run start:next`. Its server-side loaders read Express at
   `LEGACY_WEB_ORIGIN` (default `http://127.0.0.1:3001`).
4. Run the gateway with the Vite dev server as its legacy origin and open
   `http://127.0.0.1:4317`:

   ```bash
   LEGACY_WEB_ORIGIN=http://127.0.0.1:3000 PUBLIC_CARDS_NEXT_ENABLED=1 \
     PUBLIC_PAGES_NEXT_ENABLED=1 PUBLIC_GALLERY_NEXT_ENABLED=1 \
     npm run dev:public-gateway
   ```

   The gateway sends migrated pages and `/_next/` to Next (`NEXT_WEB_ORIGIN`,
   default `http://127.0.0.1:4320`) and everything else, including `/api/` and
   static files, to its `LEGACY_WEB_ORIGIN`. Without the flags it serves the
   legacy frontend.

Use the gateway for complete navigation; directly opening the Next port does not
provide `/api/` or static assets. HMR uses the direct Next development port.
Do not run the development gateway as a public production edge.

## Verification and recovery

Run `npm run build`, `npm run build:next`, `npm run lint:next`,
`npm run lint:domains`, `npm run test:public-web-gateway` and
`npm run test:next-pilot`. The pilot helper starts a real Express backend with a
temporary SQLite database, a controlled external HTTP provider, production
Next and the gateway. It closes its processes and database on completion. The
helper can build missing artifacts; rebuild explicitly after changing sources.
Never rebuild `.next` underneath a running QA server; restart it after building.

The production-build test covers FAQ/legal HTML and canonicals, catalog search,
filters, pagination, empty
results, invalid formats, unavailable-source recovery, public HTML and
JSON-LD, ordinary/Blizzard aliases, forged identity headers, bot/browser 404s,
query-preserving redirects, sitemap, and anonymous/subscribed/blocked API reads.
Personal and paid values are absent from server-rendered HTML even when the
incoming request has an authenticated cookie. The public loader never forwards
that cookie. The UI's retry button requests a fresh server render after failure.

If port 4320 is already owned, preserve that listener and run:

```bash
NEXT_TELEMETRY_DISABLED=1 npx next start apps/public-web \
  --hostname 127.0.0.1 --port 4330
```

Then set `NEXT_WEB_ORIGIN=http://127.0.0.1:4330` on the gateway. All origins
must
be bare HTTP(S) origins. The gateway stays bound to loopback. Build/development
use Webpack for the existing vendored UMD dependency; see the pilot ADR.

Changed-file Semgrep and React Doctor checks include `apps/public-web` and
exclude generated `.next` files. Run `npm run test:agent-tooling` after changing
their scope. Strict domain checks are separate from the legacy UI compiler:
full-app strict mode still depends on typing existing login error handlers
and React DOM imports.
