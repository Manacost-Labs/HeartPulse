<!-- markdownlint-disable MD013 -->

# Arena HTML routing

These files are the versioned nginx contract for public HTML routes. They are
templates only: a Git checkout does not change the live nginx configuration.

## Installation order

1. Install `arena-seo-map.conf` as
   `/etc/nginx/conf.d/31-arena-seo-map.conf`; it belongs to the `http` context.
2. Install `arena-security-headers.conf` as
   `/etc/nginx/snippets/arena-security-headers.conf`.
3. Install `arena-html-routing.conf` as
   `/etc/nginx/snippets/arena-html-routing.conf`.
4. When Tribute analytics is enabled, install
   `arena-tribute-webhook.conf` as
   `/etc/nginx/snippets/arena-tribute-webhook.conf` and include it in the
   canonical HTTPS server before `arena-html-routing.conf`.
5. Install `arena-canonical-host-redirect.conf` as
   `/etc/nginx/snippets/arena-canonical-host-redirect.conf` and include it in
   every HTTP, `www` and legacy `hs-arena.ru` redirect server. These hosts then
   normalize the scheme, host and a known HTML route's slash in one hop.
6. In the canonical `arena.hs-manacost.ru` HTTPS server, keep the TLS, root,
   origin guard, logging, gzip and server-wide security-header configuration.
7. Replace the existing API, static and SPA `location` blocks with
   `include /etc/nginx/snippets/arena-html-routing.conf;`. Do not keep the old
   catch-all beside the new include.

Every public edge proxy must install `arena-card-local-maps.conf` as
`/etc/nginx/conf.d/31-arena-card-local-maps.conf` and
`arena-edge-static-cache.conf` as
`/etc/nginx/snippets/arena-edge-static-cache.conf`. In its canonical HTTPS
server, set `$arena_proxy_region` to that node's stable label, define
`$arena_alt_svc` (an empty value is valid), and replace the generic static-file
location with the snippet include.

The edge serves synchronized card images and frontend assets from
`/srv/arena/.../current` first. A missing local file falls through to the
regional proxy cache and then to the origin. The origin's missing-resource
policy is preserved: a miss must stay `404` + `no-store`, never `immutable`.

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
