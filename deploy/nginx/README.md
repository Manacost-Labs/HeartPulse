<!-- markdownlint-disable MD013 -->

# Arena HTML routing

These files are the versioned nginx contract for public HTML routes. They are
templates only: a Git checkout does not change the live nginx configuration.

The `hearthpulse.net` cutover hosts are documented in
`docs/runbooks/hearthpulse-domain-migration.md`. The historical `shadow` file
names are retained while existing edge symlinks are updated in place; their
current contract is the indexable HearthPulse canonical host and public CDN.

## Installation order

1. Install `arena-seo-map.conf` as
   `/etc/nginx/conf.d/31-arena-seo-map.conf`; it belongs to the `http` context.
2. Install `arena-edge-region-map.conf` as
   `/etc/nginx/conf.d/32-arena-edge-region-map.conf`. It derives the bounded
   Web Vitals region from the immediate trusted proxy address and must remain
   outside the `server` block.
3. Install `arena-security-headers.conf` as
   `/etc/nginx/snippets/arena-security-headers.conf`.
4. Install `arena-html-routing.conf` as
   `/etc/nginx/snippets/arena-html-routing.conf`.
5. When Tribute analytics is enabled, install
   `arena-tribute-webhook.conf` as
   `/etc/nginx/snippets/arena-tribute-webhook.conf` and include it in the
   canonical HTTPS server before `arena-html-routing.conf`.
6. Install `arena-canonical-host-redirect.conf` as
   `/etc/nginx/snippets/arena-canonical-host-redirect.conf` and include it in
   every HTTP, `www` and legacy `hs-arena.ru` redirect server. These hosts then
   normalize the scheme, host and a known HTML route's slash in one hop.
7. In the internal `arena.hs-manacost.ru` origin HTTPS server, keep the TLS,
   root, origin guard, logging, gzip and server-wide security-header
   configuration. Public edge nodes instead install the two versioned legacy
   redirect vhosts; never install those redirects on the origin.
8. Replace the existing API, static and SPA `location` blocks with
   `include /etc/nginx/snippets/arena-html-routing.conf;`. Do not keep the old
   catch-all beside the new include.

Every public edge proxy must install `arena-card-local-maps.conf` as
`/etc/nginx/conf.d/31-arena-card-local-maps.conf` and
`arena-edge-client-region-map.conf` as
`/etc/nginx/conf.d/33-arena-edge-client-region-map.conf` and
`arena-edge-cache-path.conf` as
`/etc/nginx/conf.d/34-arena-edge-cache-path.conf` and
`arena-edge-region-forward.conf` as
`/etc/nginx/snippets/arena-edge-region-forward.conf`, and
`arena-edge-static-cache.conf` as
`/etc/nginx/snippets/arena-edge-static-cache.conf`. In its canonical HTTPS
server, set `$arena_proxy_region` to that node's stable label, define
`$arena_alt_svc` (an empty value is valid), include
`arena-edge-region-forward.conf`, and replace the generic static-file location
with the cache snippet include. The region-forward snippet must remain at
server scope so every proxied location overwrites a client-supplied region.

The client-region map requires `ngx_http_geoip2_module` and the managed
`/var/lib/GeoIP/dbip-country-lite.mmdb` file to be readable by Nginx. It
derives only a coarse region from `$remote_addr`. Never derive the metric
label from `X-Forwarded-For` or reuse a browser-provided region header.

The dedicated `cdn.arena.hs-manacost.ru` HTTPS server includes
`arena-cdn-card-image-cache.conf` and may additionally include
`arena-cdn-public-static.conf` before its default `404` location. The card
snippet reads the synchronized regional mirror before Timeweb and the origin.
Both snippets expose only documented public paths, accept only `GET` and
`HEAD`, and clear cookies and authorization before a remote fallback. They
must never be included in the application server or widened to a generic API
or file-extension match.

The public-static snippet also enables gzip for textual files at CDN server
scope. This is intentional: Russian nodes may select Brotli, while Limburg
must not depend on a region-only compression module. Already-compressed card
images are not included in `gzip_types` and keep their original bytes.

Both the application and CDN hosts serve synchronized card images and frontend
assets from `/srv/arena/.../current` first. A missing CDN card falls through to
Timeweb and then to the canonical origin. The origin's missing-resource policy
is preserved: a miss must stay `404` + `no-store`, never `immutable`.

Run the repository contract before installation:

```bash
node tests/nginx-html-routing.test.mjs
npm run test:nginx-canonical-hosts
npm run test:robots-policy
```

The test always validates the route/directive model. When an nginx binary is
available—as it is on the production host—it additionally starts an isolated
temporary server and verifies the HTTP status, redirect, robots and static-file
matrix. A production rollout must not rely on the model-only fallback: run the
test on the target host before installing the snippets.

Then validate the assembled host before any reload:

```bash
sudo nginx -t
curl -I https://arena.hs-manacost.ru/tierlist
curl -I https://arena.hs-manacost.ru/tierlist/
curl -I 'https://arena.hs-manacost.ru/?login'
curl -I https://arena.hs-manacost.ru/admin/
curl -I https://arena.hs-manacost.ru/decks/legacy
curl -I https://arena.hs-manacost.ru/definitely-unknown
curl -I https://arena.hs-manacost.ru/yandex_eaea2c59052dad81.html
curl -I https://arena.hs-manacost.ru/api/health/ready
curl -I https://arena.hs-manacost.ru/api/tribute/webhook
curl -I https://arena.hs-manacost.ru/assets/definitely-missing.js
```

Expected results are one `301` to add the canonical slash, `200` for the
canonical public route, server-side `X-Robots-Tag: noindex, nofollow` for auth
and admin states, `410` for removed product areas, `404` for unknown HTML and
an unchanged API readiness response, and `405` with `Allow: POST` for the
Tribute webhook GET probe. Reload nginx only after this matrix and
the production smoke suite pass. Run the missing-asset check against every
edge IP with `curl --resolve`; it must not contain an `immutable` cache header.

Constructed-card, hero and base Battlegrounds library detail routes proxy to
authoritative server renderers: confirmed missing entities return `404`,
catalog outages return `503` with `Retry-After`, and initial HTML contains only
whitelisted public catalog data. Format/listing routes remain static. Additional
and archive Battlegrounds detail URLs still use the anonymous SPA shell until
their entity resolvers are introduced, but that fallback carries
`X-Robots-Tag: noindex, follow` so the home canonical cannot become an
indexable soft duplicate. API, health and metrics responses are also
unconditionally `noindex, nofollow` at the edge.

The redirect contract assumes DNS and TLS routing for `www.arena.hs-manacost.ru`
already reach an nginx server that includes the versioned redirect snippet.
Provisioning that external DNS alias remains an operator step and must be
verified with the production HTTP smoke matrix before rollout is accepted.
