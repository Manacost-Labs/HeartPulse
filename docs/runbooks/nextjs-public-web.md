# Local Next.js card pilot

Production remains on Vite/Express. No service, Nginx configuration, live data or
release is changed by these commands. Work from the isolated repository checkout.

1. Install locked dependencies with `npm ci`.
2. Start Express using an isolated environment and temporary database as described
   by `tests/helpers/credentialBackend.mjs`. Never source the production
   environment for QA.
3. Set `LEGACY_WEB_ORIGIN` to that loopback Express origin. Run `npm run build:next`
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
