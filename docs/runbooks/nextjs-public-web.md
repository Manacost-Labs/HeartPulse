# Local Next.js public web development

Production Nginx sends every public HTML page to Next.js; see
[the production cutover runbook](nextjs-production-cutover.md) and
[the route coverage ledger](../plans/nextjs-route-coverage.md). The commands
below run the app locally for development and QA only. No service, Nginx
configuration, live data or release is changed by them. Work from an isolated
repository checkout. The app's structure and rules are in
[`apps/public-web/README.md`](../../apps/public-web/README.md).

1. Install locked dependencies with `npm ci`.
2. Run `npm run dev` and open `http://localhost:3000`. It starts three
   processes:
   - `dev:server`: Express on port 3001 (set `HOST=127.0.0.1` to keep it on
     loopback);
   - `dev:next`: `next dev` on loopback port 4320; its server-side loaders
     read Express at `LEGACY_WEB_ORIGIN` (default `http://127.0.0.1:3001`);
   - `dev:web`: the gateway on port 3000. It sends pages and `/_next/`,
     including the hot-update WebSocket, to Next (`NEXT_WEB_ORIGIN`, default
     `http://127.0.0.1:4320`), serves the files of `public/`
     (`PUBLIC_WEB_STATIC_DIR`) itself and sends everything else, including
     `/api/`, to Express (`LEGACY_WEB_ORIGIN`).
3. For QA, start Express with an isolated environment and temporary database
   as described by `tests/helpers/credentialBackend.mjs` instead, and point
   the other two processes at it with `LEGACY_WEB_ORIGIN`. Never source the
   production environment for QA.
4. To run the production build locally, use `npm run build:static`,
   `npm run build:next` and `npm run start:next` in place of `dev:next`.

Use the gateway for complete navigation; directly opening the Next port does not
provide `/api/` or static assets. The gateway listens on loopback only; set
`PUBLIC_WEB_HOST` to open it to another device on a trusted network. It also
sends the `next dev` overlay requests (`/__nextjs…`) to Next. An unknown path
gets the Express 404 there, not the Next.js not-found page that Nginx serves
in production.
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
