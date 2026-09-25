# Next.js production cutover

The public card catalog, card details, gallery, FAQ, privacy, terms, articles,
contests, Arena classes, Arena tier list, Arena legendary groups, Standard
matchups, Standard meta, fun decks, Vicious Gold, the archetype catalog and
details, the guide archive and details, the Battlegrounds hero catalog and
details, library listings and all supported current/archive card details, both
public-profile URL patterns, the administrator workspace, and home pages are
owned by Next.js. Express continues to own APIs, authentication, subscriptions
and data access; remaining HTML stays on the legacy frontend.

## Stage the runtime

Until the Vite retirement step, Storybook relies on Vite's automatic
`public/` asset serving and copying. Do not add that directory to Storybook
`staticDirs`: copying it twice can race and fail the release validation build.

From a clean reviewed `main` checkout, install the service before publishing
the first release containing `apps/public-web/.next`:

```bash
sudo install -m 644 deploy/hs-arena-next.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/hs-arena-next.service
sudo systemctl enable hs-arena-next.service
systemctl is-enabled hs-arena-next.service
```

The CI release includes the Next build without its build cache and checksums
all shipped Next files. The root deployer restarts the API and Next from the
same `current` symlink, waits for both health endpoints, and restores the
previous release if either service fails. Next embeds the release SHA in client
incident reports from `RELEASE_SHA` or `GITHUB_SHA`, matching the legacy
release marker. Before changing Nginx, confirm:

```bash
curl -fsS http://127.0.0.1:3101/health/ready
curl -fsS http://127.0.0.1:4321/health/next/
curl -fsS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:4321/standard/cards/standard/
curl -fsS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:4321/gallery/
systemctl is-active hs-arena-next.service
```

Enable the unit before the first release, but let the deployer start it after
the `.next` artifact exists. On a host that already has a valid release, use
`sudo systemctl enable --now hs-arena-next.service` to restore both boot-time
and current availability. Verify `is-enabled`, `is-active` and the public card
URL after a host reboot: a manual `start` alone does not survive one.

Keep the current Nginx route map on the legacy frontend until those checks
pass. APIs and identity callbacks must continue to reach Express directly.

## Switch and roll back routing

For each new HTML route, first deploy the Next implementation behind the
unchanged Nginx map and confirm its direct port-4321 response. Then install the
reviewed route snippet, validate and reload Nginx, and release the matching
versioned Nginx contract. The CI deploy helper must allow that exact contract
hash; its workflow test pins the same value. This order keeps the old route
working until the new renderer is available.

Save the installed origin route snippet and SEO map, then install the reviewed
`deploy/nginx/arena-html-routing.conf` and `deploy/nginx/arena-seo-map.conf`,
run `sudo nginx -t`, and reload Nginx.
The snippet preserves canonical slash redirects, forwards card catalogs and
details plus gallery, FAQ, privacy, terms, developer API documentation, articles,
contests, Arena classes, Arena tier list, Arena legendary groups, Standard
matchups, Standard meta, fun decks, Vicious Gold, the archetype catalog and
its detail/legacy-meta URLs, the guides archive and guide details, the
Battlegrounds hero catalog and details, library listings and all supported
current/archive card details, cosmetics catalogs and details, the Battlegrounds
tier list and builders, the device-connection page, and home
to port 4321, and forwards
`/_next/` build
assets to the same process.
The SEO map keeps filtered article pages `noindex, follow`, the home login
query `noindex, nofollow`, and adds a
`noindex, nofollow` response header to Next HTML errors without changing
ordinary successful responses. Hero and all supported library detail HTML goes
to Next, while Express remains the public projection and paid-data authority.
The `/connect/` HTML remains `noindex, nofollow` and `no-store` on every
response; Express still owns the session and device-approval API. Public
`/id/:id/` and legacy `/profiles/:id/` HTML use the Express public-profile
projection through Next. Check a live profile, the legacy alias, a missing ID,
an invalid ID, the slash redirect and the numeric canonical. Successful
profiles retain `noindex, follow`; errors are `noindex, nofollow`, and the
entire profile namespace remains `no-store`.
The exact `/admin/` document also uses Next, while `/admin` retains its
query-preserving 301. The Next server checks the existing Express session and
renders no private user fields into HTML; the browser rechecks access before
loading the workspace. Keep the document and errors `noindex, nofollow` and
`no-store`, and leave `/api/admin/` on Express. Check guest, administrator,
blocked-account and mobile-menu states before opening the route. If it fails,
restore the saved Nginx route snippet and reload after `nginx -t`.
Their rules hide upstream `X-Robots-Tag` before setting one edge error header;
this avoids duplicate headers on retryable 503 pages. For these details,
sample a live ID, missing ID and canonical redirect. The focused fixture
test covers upstream 503, `Retry-After`, HEAD and no-store. Include a long
Cyrillic slug from the live minion sitemap in direct-port and public checks;
URL encoding must not make a valid card look missing.
Other HTML and API routes remain on Express/Vite. Check each of the nine
current and seven archive detail kinds with a real DBF ID through the public
host, plus an absent ID and an unsupported archive kind. Confirm the upstream
public projections contain no paid statistics before opening the Nginx owner.
Verify the canonical public host on desktop and mobile: both card catalogs,
a card detail sampled from the live sitemap, a confirmed unknown card (404
with an `X-Robots-Tag: noindex` header), gallery image loading and downloads,
FAQ, privacy, terms, developer API documentation, articles, filtered article
queries, contests, Arena classes (guest paywall and subscribed statistics),
Arena tier list (guest paywall, subscribed source switching and companion filtering),
Arena legendary groups (guest paywall and subscribed source switching),
home and `/?login`, `_next/static` assets,
console/network errors and the
subscription gate. Confirm canonical metadata and that API requests still
reach Express. The CI release monitor must pass for the exact deployed SHA.

If a routed page fails, restore the saved Nginx snippet and SEO map, run
`sudo nginx -t` and reload before changing application releases. The legacy
HTML remains in the same immutable artifact, so restoring both files returns
these routes to Vite/Express. Retain the previous application release and the
encrypted data backup for the normal release rollback procedure in
[DEPLOYMENT.md](../../DEPLOYMENT.md).
