# Next.js production cutover

The public card catalog, card details, FAQ, privacy and terms pages are the
only routes owned by Next.js. Express continues to own APIs, authentication,
subscriptions and data access; all other HTML remains on the legacy frontend.

## Stage the runtime

From a clean reviewed `main` checkout, install the service before publishing
the first release containing `apps/public-web/.next`:

```bash
sudo install -m 644 deploy/hs-arena-next.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/hs-arena-next.service
```

The CI release includes the Next build without its build cache and checksums
all shipped Next files. The root deployer restarts the API and Next from the
same `current` symlink, waits for both health endpoints, and restores the
previous release if either service fails. Before changing Nginx, confirm:

```bash
curl -fsS http://127.0.0.1:3101/health/ready
curl -fsS http://127.0.0.1:4321/health/next/
curl -fsS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:4321/standard/cards/standard/
```

Keep the current Nginx route map on the legacy frontend until those checks
pass. APIs and identity callbacks must continue to reach Express directly.

## Switch and roll back routing

Save the installed origin route snippet, then install the reviewed
`deploy/nginx/arena-html-routing.conf`, run `sudo nginx -t`, and reload Nginx.
The snippet preserves canonical slash redirects, forwards card catalogs and
details plus FAQ, privacy and terms to port 4321, and forwards `/_next/` build
assets to the same process. Other HTML and API routes remain on Express/Vite.
Verify the canonical public host on desktop and mobile: both card catalogs,
a card detail sampled from the live sitemap, a confirmed unknown card, FAQ,
privacy, terms, `_next/static` assets, console/network errors and the
subscription gate. Confirm canonical metadata and that API requests still
reach Express. The CI release monitor must pass for the exact deployed SHA.

If a routed page fails, restore the saved Nginx snippet, run `sudo nginx -t`
and reload before changing application releases. The legacy HTML remains in
the same immutable artifact, so restoring the snippet immediately returns
these routes to Vite/Express. Retain the previous application release and the
encrypted data backup for the normal release rollback procedure in
[DEPLOYMENT.md](../../DEPLOYMENT.md).
