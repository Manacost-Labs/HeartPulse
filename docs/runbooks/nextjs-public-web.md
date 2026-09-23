# Local Next.js card pilot

Production remains on Vite/Express. No service, Nginx configuration, live data or
release is changed by these commands. Work from the isolated repository checkout.

1. Install locked dependencies with `npm ci`.
2. Start Express using an isolated environment and temporary database as described
   by `tests/helpers/credentialBackend.mjs`. Never source the production
   environment for QA.
3. Build the legacy frontend with `npm run build`. Set `LEGACY_WEB_ORIGIN` to
   that loopback Express origin. Run `npm run build:next`
   then `npm run start:next` (loopback port 4320), or `npm run dev:next`.
4. Run `LEGACY_WEB_ORIGIN=http://127.0.0.1:3001 npm run dev:public-gateway`, replacing
   3001 with the test backend port. Gateway port is 4317 by default. Routes are
   legacy because `PUBLIC_CARDS_NEXT_ENABLED` defaults to off.
5. Restart the gateway with `PUBLIC_CARDS_NEXT_ENABLED=1` to assign card details
   to
   Next. `NEXT_WEB_ORIGIN` defaults to `http://127.0.0.1:4320`.
6. To roll back, restart the gateway without the flag (or set it to `0`). No data
   migration, cookie change or application rebuild is needed. Keep the legacy
   build available throughout the pilot.

Use the gateway for complete navigation; directly opening the Next port does not
provide legacy routes or static assets. HMR uses the direct Next development
port; the staging gateway is intended for HTTP production-build verification.

Before any separately authorized production activation, apply this exact URL
ownership to the existing Nginx deployment contract, preserve TLS/rate limits,
start Next as a separate loopback service and run the pilot integration suite.
Do not run the development gateway as a public production edge.

## Verification and recovery

Run `npm run build`, `npm run build:next`, `npm run lint:next`,
`npm run lint:domains`, `npm run test:public-web-gateway` and
`npm run test:next-pilot`. The pilot helper starts a real Express backend with a
temporary SQLite database, a controlled external HTTP provider, production
Next and the gateway. It closes its processes and database on completion. The
helper can build missing artifacts; rebuild explicitly after changing sources.
Never rebuild `.next` underneath a running QA server; restart it after building.

The production-build test covers unavailable-source recovery, public HTML and
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

Then set `NEXT_WEB_ORIGIN=http://127.0.0.1:4330` on the gateway. All origins must
be bare HTTP(S) origins. The gateway stays bound to loopback. Build/development
use Webpack for the existing vendored UMD dependency; see the pilot ADR.

Changed-file Semgrep and React Doctor checks include `apps/public-web` and
exclude generated `.next` files. Run `npm run test:agent-tooling` after changing
their scope. Strict domain checks are separate from the legacy UI compiler:
full-app strict mode still depends on typing existing login error handlers
and React DOM imports.
