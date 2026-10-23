<!-- markdownlint-disable MD013 -->

# HearthPulse edge caching

How `hearthpulse.net` documents and files are cached between the browser, the
two RF edges (Moscow `194.67.92.242`, Novosibirsk `186.246.28.244`) and the
origin, and how to install a change to it. The browser contract is in
[public document caching](../specs/public-document-caching.md).

## Path of a request

`hearthpulse.net` resolves to both RF edges (active-active). Each edge runs
`deploy/nginx/hearthpulse-shadow-app.conf` and reaches the origin
(`151.80.21.140`, nginx → Next on `127.0.0.1:4321`, Express on `:3101`)
through local SSH reverse tunnels (`127.0.0.1:18443-18445` on the edge). The
edge keeps its upstream connections alive; every request that the edge does
not answer itself still costs at least one tunnel round trip.

Measured from the origin host on 2026-10-20 (release `51d3637b`):

| | Moscow | Novosibirsk |
| --- | --- | --- |
| client → edge TCP round trip | 47 ms | 92 ms |
| `robots.txt` (one tunnel trip) after TLS | 95 ms | 190 ms |
| `/tierlist/` after TLS | 160-210 ms | 390-410 ms |
| `/_next/static/…`, `/assets/`, `/wallpaper/` | `HIT`, about 1 RTT | `BYPASS`, 380-790 ms |
| `cdn.hearthpulse.net/api/card-image/…` | `HIT` | `BYPASS` |
| Next on the origin, direct | 4-9 ms | 4-9 ms |

The application itself is fast; the time is transport. Novosibirsk is slower
for three reasons: it is farther from both visitors and the origin (twice the
round trip of Moscow), every document crosses that longer tunnel two or three
times (the HTML body passes the tunnel's TCP slow start before brotli emits its
first bytes), and on 2026-10-20 it answered every build asset, public file and
`cdn.hearthpulse.net` card image with `X-Proxy-Cache: BYPASS`, so a page's
20-40 files each crossed the tunnel. Its three versioned files matched the
repository (the only live addition on both edges is the MCP snippet include,
now versioned), so the cause was elsewhere on that host; the edge tuning of
the same day restored `HIT`. `deploy/monitor-hearthpulse-shadow.sh` now fails
whenever an edge answers public files or CDN cards with `BYPASS`.

Release delivery: documents always come from the origin, so every edge names
the current release's chunks, and `/_next/static/` is proxied to the origin
through the edge cache. Since 2026-10-23 the monitor also fetches the first
`/_next/static/chunks/*.js` of each edge's own home page through that edge and
fails unless it answers `200` with a JavaScript type: an edge that serves the
new HTML but cannot deliver its build would otherwise render a blank page.

## What each layer keeps

| Response | Browser | Edge |
| --- | --- | --- |
| `/_next/static/`, `/assets/`, `/fonts/`, `/wallpaper/`, `/uploads/`, icons | `immutable`, 30 d to 1 y | `hs_arena_cache`, as long as the origin allows |
| `/api/article-cover`, `/api/public-resource/` | `public, max-age=86400, stale-while-revalidate=604800` | `hs_arena_cache`, as long as the origin allows |
| Card images on `cdn.hearthpulse.net` | `immutable`, 30 d | local mirror, then `hs_arena_cache` |
| Anonymous public documents and their RSC payloads | `private, no-cache`, restorable by Back | `hearthpulse_documents`: 60 s; an expired copy is never served, not even while the origin fails; dropped after 1 h without a visit |
| `/?login`, admin, account, profile documents | `no-store` | never |
| Other `/api/` responses | Express's header (`/api/auth/me`: `no-store`) | never |
| `/runtime-config.js` | `no-store` | never |

The edge stores a document only when all of these hold
(`arena-edge-cache-path.conf`): the request has no `Cookie` and no
`Authorization` header, the status is `200`, the response has no `Set-Cookie`,
it carries `X-HearthPulse-Edge-Cache: anonymous` (set by
`apps/public-web/documentCaching.mjs` only for the route families whose server
modules read no cookies), its type is HTML or an RSC payload and its `Vary`
names exactly the RSC headers that are part of the cache key. The edge blanks
Next-internal request headers outside the key (`X-Middleware-Prefetch` makes
Next answer a marked `{}`), and takes no cache lock, so never-stored requests
such as `/?login` are not queued. A request with a cookie neither reads nor fills the
copy, so a signed-in or paying visitor always receives the origin's own
rendering and no viewer data can enter the shared copy. The marker never
reaches the browser. Prerendered pages (`/faq/`) send `s-maxage=31536000`;
the edge ignores `Cache-Control` for documents and never trusts that value.

The key joins the RSC request headers with `|` and puts the URI last. A
request whose `RSC` or `Next-Router-Prefetch` is not empty or `1`, or whose
other key headers contain `|`, bypasses the copy, so two different requests
can never share an entry.

There is no stale copy at all (`proxy_cache_use_stale off`): nginx cannot
bound its age, so during a long origin failure, or after a page answers
`404` or lost its marker, it would be served for days. A removed page or
marker therefore stops being served within 60 s, and an origin outage shows
its error after at most 60 s, as before this cache. Immutable assets and
public media keep serving stale copies on origin errors. Content-hashed Next assets of
earlier releases stay on the origin for 35 days, so a document cached just
before a deploy still loads; its next RSC request reaches the new build,
which Next answers with a full navigation.

## Install

The order keeps every step compatible with the application releases before
and after it. Nothing is cached until both the application marker (step 2)
and the edge configuration (step 3) are live. Run every step from the reviewed
`main` checkout (`$REL`).

### 1. Origin (home page restorable by Back)

```bash
REL=/srv/projects/web/arena.hs-manacost.ru   # reviewed main checkout
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
sudo cp -a /etc/nginx/conf.d/31-arena-seo-map.conf /etc/nginx/conf.d/31-arena-seo-map.conf.pre-edge-cache-$STAMP
sudo cp -a /etc/nginx/snippets/arena-html-routing.conf /etc/nginx/snippets/arena-html-routing.conf.pre-edge-cache-$STAMP
node "$REL/tests/nginx-html-routing.test.mjs"
sudo install -m 0644 -o root -g root "$REL/deploy/nginx/arena-seo-map.conf" /etc/nginx/conf.d/31-arena-seo-map.conf
sudo install -m 0644 -o root -g root "$REL/deploy/nginx/arena-html-routing.conf" /etc/nginx/snippets/arena-html-routing.conf
sudo nginx -t && sudo systemctl reload nginx
```

If `nginx -t` fails, restore both `.pre-edge-cache-$STAMP` copies, run
`sudo nginx -t` and reload. Check through an edge:

```bash
curl -s -o /dev/null -D- https://hearthpulse.net/ | grep -i '^cache-control'
curl -s -o /dev/null -D- 'https://hearthpulse.net/?login' | grep -iE '^(cache-control|pragma|x-robots-tag)'
```

`/` must show exactly one `cache-control: private, no-cache`; `/?login` must
show `no-store`, `pragma: no-cache` and `x-robots-tag: noindex, nofollow`.

### 2. Application

Push the reviewed commit to `main`. CI passes the new
`--allow-nginx-contract-hash`, and the deployer refuses the release unless the
origin files from step 1 are installed. After the deploy,
`curl -sI https://hearthpulse.net/tierlist/` shows
`x-hearthpulse-edge-cache: anonymous` until step 3 hides it.

### 3. Each edge, Moscow first

No deploy step installs edge nginx files: the deployer only verifies the
origin's. `deploy/install-hearthpulse-edge-nginx.sh` does it from the origin as
root, through the static-sync topology `/etc/hs-arena/edge-static-sync.conf`
(its `ARENA_STATIC_EDGE_SPECS` entries and root-only SSH identities). It
handles `34-arena-edge-cache-path.conf`, `hearthpulse-shadow-app.conf` and
`hearthpulse-shadow-cdn.conf`. Per edge it saves `nginx -T` and the replaced
files under `/root/hearthpulse-nginx-backup/<UTC stamp>/`, installs, runs
`nginx -t` and reloads; a failed test restores that edge and stops before the
next one. Name the edges explicitly (Limburg is quarantined):

```bash
REL=/var/www/koloda/data/www/hs-arena.ru/current   # after step 2
sudo bash "$REL/deploy/install-hearthpulse-edge-nginx.sh" --check 194.67.92.242 186.246.28.244 | tee /root/hearthpulse-edge-drift.diff
sudo bash "$REL/deploy/install-hearthpulse-edge-nginx.sh" --install 194.67.92.242
# check Moscow (below), then
sudo bash "$REL/deploy/install-hearthpulse-edge-nginx.sh" --install 186.246.28.244
```

`--check` prints a unified diff per file and edge (exit `1` on drift) and the
configuration files that `nginx -T` loads, which must include
`sites-enabled/hearthpulse-shadow-app.conf` and no second HearthPulse server.
Keep its Novosibirsk output with the rollout report. If an edge address is
not in the topology the script refuses it (exit `2`); add the edge there
first. Before step 2 the script is not in the release yet: run it from the
reviewed checkout with `HEARTHPULSE_EDGE_NGINX_RELEASE=$REL_CHECKOUT`.

Manual fallback, as root on the edge, with the files copied from
`$REL/deploy/nginx/`:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
nginx -T > /root/nginx-T.pre-edge-cache-$STAMP.txt
nginx -T | grep -n 'server_name hearthpulse.net;'   # must name sites-enabled/hearthpulse-shadow-app.conf
readlink -f /etc/nginx/sites-enabled/hearthpulse-shadow-app.conf
df -h /var/cache/nginx                              # needs 8 GB min_free plus 1 GB
cp -a /etc/nginx/conf.d/34-arena-edge-cache-path.conf /root/34-arena-edge-cache-path.conf.pre-edge-cache-$STAMP
cp -a /etc/nginx/sites-available/hearthpulse-shadow-app.conf /root/hearthpulse-shadow-app.conf.pre-edge-cache-$STAMP
install -m 0644 -o root -g root arena-edge-cache-path.conf /etc/nginx/conf.d/34-arena-edge-cache-path.conf
install -m 0644 -o root -g root hearthpulse-shadow-app.conf /etc/nginx/sites-available/hearthpulse-shadow-app.conf
nginx -t && systemctl reload nginx
```

On both edges, first compare the installed files with the release
(`--check`); on 2026-10-20 they differed only by this change and the MCP
include. `hearthpulse-shadow-cdn.conf` is unchanged and already current on both.
Afterwards a repeated
`curl -sI --resolve cdn.hearthpulse.net:443:$IP https://cdn.hearthpulse.net/api/card-image/DINO_410/full.webp`
must show `X-Proxy-Cache` `HIT` or `LOCAL`. If the `server_name hearthpulse.net` server comes
from any file other than `sites-available/hearthpulse-shadow-app.conf`, stop
and reconcile that first; two servers for one name make nginx pick the first.
If `nginx -t` fails, restore both backups, `nginx -t`, reload.

Check every edge (`IP` is the edge address):

```bash
r="--resolve hearthpulse.net:443:$IP"
curl -sI $r https://hearthpulse.net/favicon.ico | grep -i x-proxy-cache         # HIT or MISS, never BYPASS
for i in 1 2; do curl -s -o /dev/null -D- $r https://hearthpulse.net/tierlist/ | grep -iE '^(x-proxy-cache|cache-control|x-hearthpulse)'; done
curl -s -o /dev/null -D- $r -H 'Cookie: probe=1' https://hearthpulse.net/tierlist/ | grep -i x-proxy-cache   # BYPASS
curl -s -o /dev/null -D- $r 'https://hearthpulse.net/?login' | grep -iE '^(x-proxy-cache|cache-control)'      # never HIT, no-store
curl -s -o /dev/null -D- $r https://hearthpulse.net/api/auth/me | grep -iE '^(x-proxy-cache|cache-control)'  # BYPASS, no-store
curl -sI $r 'https://hearthpulse.net/api/article-cover?url=…' | grep -i x-proxy-cache                       # HIT on repeat
```

The second `/tierlist/` must be `HIT` with `cache-control: private, no-cache`
and no `x-hearthpulse-edge-cache`. Then run
`bash $REL/deploy/monitor-hearthpulse-shadow.sh` and the production smoke
suite.

## Rollback

- Document cache only, on one edge: restore the two `/root/*.pre-edge-cache-*`
  copies, `nginx -t`, reload, then
  `find /var/cache/nginx/hearthpulse-documents -type f -delete`.
- Unpublish or emergency content fix: the same `find … -delete` on **both**
  edges, so the page disappears at once instead of within 60 s. It is safe while nginx runs; the next visit refills the
  copy.
- Origin: restore the two `.pre-edge-cache-*` files, `nginx -t`, reload. The
  deployer then reports drift against this release until the application is
  rolled back to the previous release as well (see
  [the deployer contract](production-deployer-contract.md)).
- Application: the normal release rollback, then the `find … -delete` on
  both edges (required). Without the marker no edge stores a new document,
  and stored entries stop being served within 60 s; the purge removes them
  at once.

## Not changed, follow-ups

- HTTP/3: neither edge advertises `Alt-Svc`. Enabling it needs an nginx with
  `ngx_http_v3_module` on both edges, UDP 443 open and `listen 443 quic`; it
  saves one round trip per new connection. Owner/root decision.
- Per-edge Web Vitals: the HearthPulse vhost does not forward
  `X-Arena-Edge-Region`, so RUM reports both RF edges as `origin`. Forwarding
  it (a `map $server_addr` on each edge) is the evidence needed before
  deciding whether Novosibirsk should stay in the `hearthpulse.net` answer
  (see [the GeoDNS policy](../operations/arena-geodns-edge-cache.md)).
- Card pages load images from `cdn.hearthpulse.net` without a
  `<link rel="preconnect">`; the first card image pays a separate connection.
