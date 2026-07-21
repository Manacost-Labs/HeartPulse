<!-- markdownlint-disable MD013 -->

# Arena HTML routing

These files are the versioned nginx contract for public HTML routes. They are
templates only: a Git checkout does not change the live nginx configuration.

## Installation order

1. Install `arena-seo-map.conf` as
   `/etc/nginx/conf.d/31-arena-seo-map.conf`; it belongs to the `http` context.
2. Install `arena-html-routing.conf` as
   `/etc/nginx/snippets/arena-html-routing.conf`.
3. In the canonical `arena.hs-manacost.ru` HTTPS server, keep the TLS, root,
   origin guard, logging, gzip and server-wide security-header configuration.
4. Replace the existing API, static and SPA `location` blocks with
   `include /etc/nginx/snippets/arena-html-routing.conf;`. Do not keep the old
   catch-all beside the new include.
5. Keep the HTTP and `www` virtual hosts redirecting to
   `https://arena.hs-manacost.ru$request_uri`. Combined host/scheme plus slash
   normalization remains a separate edge-policy task (see limitations below).

Run the repository contract before installation:

```bash
node tests/nginx-html-routing.test.mjs
```

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
```

Expected results are one `301` to add the canonical slash, `200` for the
canonical public route, server-side `X-Robots-Tag: noindex, nofollow` for auth
and admin states, `410` for removed product areas, `404` for unknown HTML and
an unchanged API readiness response. Reload nginx only after this matrix and
the production smoke suite pass.

The template validates route shapes, not entity existence. A syntactically
valid card, hero or Battlegrounds detail URL may use the anonymous SPA shell
until an authoritative server-side entity resolver is introduced. The resolver
must distinguish a confirmed missing entity (`404`) from an unavailable data
source (`503`) and must never expose subscriber-only data in initial HTML.

Two additional gaps remain explicit rather than being hidden by the contract:

- `/r/:slug` is still resolved by the client and therefore returns a noindex
  shell with `200`, while the route inventory targets a server `302`. Moving
  target lookup into an authoritative Express redirect handler is required
  before marking that inventory status complete.
- An HTTP or `www` request for a known URL without its canonical slash currently
  takes a host/scheme redirect followed by the slash redirect. A route-aware
  edge redirect map is required to collapse the combined case to one hop.
