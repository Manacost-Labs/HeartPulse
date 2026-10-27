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
| Anonymous public documents and their RSC payloads | `private, no-cache`, restorable by Back | `hearthpulse_documents`: 60 s, ISR pages without server data 300 s; an expired copy is answered while it refreshes in the background; never served more than 10 min after it was stored; dropped after 10 min without a visit |
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
Next answer a marked `{}`), and takes no cache lock: nginx re-checks a lock
only every 500 ms, so identical never-stored requests such as `/?login` or the
RSC prefetches of unmarked routes would queue one after another, while a
waiter saves nothing (the origin answers in milliseconds, the tunnel trip is
paid either way). A request with a cookie neither reads nor fills the
copy, so a signed-in or paying visitor always receives the origin's own
rendering and no viewer data can enter the shared copy. The marker never
reaches the browser. Prerendered pages (`/faq/`) send `s-maxage=31536000`;
the edge ignores `Cache-Control` for documents and never trusts that value.

The key joins a ten-minute epoch of the edge clock and the RSC request
headers with `|` and puts the URI last. A
request whose `RSC` or `Next-Router-Prefetch` is not empty or `1`, or whose
other key headers contain `|`, bypasses the copy, so two different requests
can never share an entry.

An expired copy is answered at once while one background request refreshes
it (`proxy_cache_use_stale updating`, `proxy_cache_background_update on`;
never `error` or `timeout`). Before 2026-10-27 there was no stale copy at all,
and a regional edge paid 0.6-1.4 s on every miss and once 5.7 s on an expired
copy while the origin answered in 1-22 ms. nginx keeps answering the expired
copy for as long as every refresh fails (a `502`, a `404` of a removed page,
a lost marker) and cannot bound its age itself (checked with nginx 1.30); the
epoch in the key bounds it: no copy is answered more than ten minutes after it
was stored, and the first request of every epoch, a miss, sees the origin's
own answer. A removed page or marker therefore stops being served within
10 min, and an origin outage shows its error after at most 10 min. The ISR
pages whose HTML holds no server data (`revalidate = 300` without
`/standard/meta/` and `/articles/`, whose build copy is empty until
`/health/next/revalidate/` runs after a deploy) stay fresh for 300 s, the
others for 60 s. Immutable assets and
public media keep serving stale copies on origin errors. Content-hashed Next assets of
earlier releases stay on the origin for 35 days, so a document cached just
before a deploy still loads. An RSC payload of the earlier build may still be
answered from its copy until it expires (60 s, 300 s on the ISR pages, at
most the epoch); Next answers such a build mismatch with a full navigation.

Side effects of the background refresh:

- On an HTTP/1.1 keep-alive connection nginx starts the next request only
  after the refresh finished, so `curl` loops and bots on HTTP/1.1 still see
  one origin trip after a `STALE` answer. Browsers use HTTP/2 and do not.
- The eight ISR pages render the runtime switches of the moment Next renders
  them: the build copy has them off for up to 5 min after a deploy, and a
  switch flip (`cardImageCdn` and the other root-managed switches, which Next
  itself picks up within 30 s) reaches these documents only after Next's
  `revalidate` plus the edge's 300 s, about 10 min. For an immediate effect
  purge the document cache on both edges (Rollback below).

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
handles `34-arena-edge-cache-path.conf`, `hearthpulse-shadow-app.conf`,
`hearthpulse-shadow-cdn.conf` and `hearthpulse-legacy-hs-arena.conf`
([Retired hs-arena.ru](#retired-hs-arenaru)); a vhost with no
`sites-enabled` link to it is enabled. Per edge it saves `nginx -T` and the replaced
files under `/root/hearthpulse-nginx-backup/<UTC stamp>/`, installs, runs
`nginx -t` and reloads; a failed test, or a warning that another server also
declares one of the managed names, restores that edge and stops before the
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

## Retired hs-arena.ru

`hs-arena.ru` and `www.hs-arena.ru` resolve only to Moscow. Until this change
both edges answered them with a hand-made vhost that is not in the repository:
port 80 sent `301 https://$host$request_uri`, port 443 proxied to the deckview
API on the origin (`api.blizzcore.ru`), so the retired site returned `200` with
deckview JSON (audit finding В-7). It is not the default server; that one is
`job.hs-manacost.ru`. `deploy/nginx/hearthpulse-legacy-hs-arena.conf` replaces
it: one `301` to `https://hearthpulse.net$request_uri` on 80 and 443, the
ACME path on 80 still served from `/var/www/letsencrypt`.

Evidence of 2026-10-27, from the origin:

- No deckview consumer uses this name. The edge forwards it to the origin's
  deckview server (the probes of this check appeared in
  `/var/log/nginx/deckview-api-domain.access.log`); from 2026-10-13 to
  2026-10-27 that log shows only `GET /` from `curl`, the SEO audit and Uptime
  Kuma, and no `/render`, `/translate` or `/archetype` call through the edge.
  Kuma monitors 1 and 10 (`https://hs-arena.ru/`) accept `200-399` and follow
  up to 10 redirects: they stay green but then measure `hearthpulse.net`.
- Certificate: both edges present the same Let's Encrypt certificate for
  `hs-arena.ru, www.hs-arena.ru` (serial `0550C3BE…021E`, valid until
  2027-01-05). The origin has no lineage for it, and the zone is in another
  Cloudflare account (NS `suzanne`/`bjorn`) than the origin's DNS-01 tokens,
  so it was issued on an edge with HTTP-01 and copied to the other. Its path
  on the edges and the renewal setup were not visible from the origin.

### Prerequisites, as root on each edge

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
# 1. Which file holds the hand-made server, and its certificate.
nginx -T 2>/dev/null | awk '/^# configuration file /{f=$4} /server_name .*hs-arena[.]ru/{print f, $0}'
nginx -T 2>/dev/null | awk '/server_name .*hs-arena[.]ru/{s=1} s && /ssl_certificate|acme|root /{print} /^}/{s=0}'
# 2. How it renews (Moscow; expect the lineage hs-arena.ru).
certbot certificates -d hs-arena.ru
grep -E '^(authenticator|installer|webroot_path)|^hs-arena|^www' /etc/letsencrypt/renewal/hs-arena.ru.conf
```

- Make the certificate available as `/etc/nginx/ssl/hs-arena.ru/fullchain.pem`
  and `privkey.pem`. Where the lineage exists and that directory does not,
  link it so renewals apply:
  `ln -sn /etc/letsencrypt/live/hs-arena.ru /etc/nginx/ssl/hs-arena.ru`.
  Elsewhere copy the files that the hand-made server names (`install -d -m
  0755`, then `install -m 0644` the chain and `install -m 0600` the key).
- Renewal: the `webroot` authenticator with `/var/www/letsencrypt` and the
  `nginx` authenticator both keep working (the redirect is a `location`). Any
  other webroot path: stop and change the vhost first. The certificate on the
  edge without the lineage is a copy; it expires on 2027-01-05 unless the
  renewal copies it (find the hook with
  `grep -rl hs-arena /etc/letsencrypt/renewal-hooks /etc/cron* /usr/local/sbin`).
- Disable the hand-made server without reloading:
  `mkdir -p /root/hs-arena-manual-$STAMP && mv /etc/nginx/sites-enabled/<its link> /root/hs-arena-manual-$STAMP/`.
  If that file also declares other names, stop and remove only its
  `hs-arena.ru` server blocks instead. If it stays enabled, the installer
  refuses with `another server also declares hs-arena.ru` and restores the
  edge.

### Install and verify

From the origin, as in step 3: `--check` must show only the new file as drift
(any other diff is someone's manual change: reconcile it first), then
`--install 194.67.92.242`, verify, then `--install 186.246.28.244`.

```bash
for ip in 194.67.92.242 186.246.28.244; do for h in hs-arena.ru www.hs-arena.ru; do
  curl -s -o /dev/null -w "$ip $h http  %{http_code} %{redirect_url}\n" --resolve $h:80:$ip "http://$h/render?x=1"
  curl -s -o /dev/null -w "$ip $h https %{http_code} %{redirect_url} tls=%{ssl_verify_result}\n" --resolve $h:443:$ip "https://$h/render?x=1"
done; done
```

Every line must be `301 https://hearthpulse.net/render?x=1`, `tls=0` on
HTTPS. Then on Moscow `certbot renew --dry-run --cert-name hs-arena.ru` must
succeed, `--check` must print one file per managed `server_name`, and the
step 3 checks and `deploy/monitor-hearthpulse-shadow.sh` must still pass.

### Rollback, as root on the edge

```bash
B=/root/hearthpulse-nginx-backup/<stamp printed by the install>
rm -f /etc/nginx/sites-enabled/hearthpulse-legacy-hs-arena.conf /etc/nginx/sites-available/hearthpulse-legacy-hs-arena.conf
mv /root/hs-arena-manual-<STAMP>/<its link> /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

The other three files in `$B` are needed only if `--check` showed drift in
them before the install (copy each back to its path). The certificate link or
copy under `/etc/nginx/ssl/hs-arena.ru/` can stay.

## Rollback

- Document cache only, on one edge: restore the two `/root/*.pre-edge-cache-*`
  copies, `nginx -t`, reload, then
  `find /var/cache/nginx/hearthpulse-documents -type f -delete`.
- Unpublish or emergency content fix: the same `find … -delete` on **both**
  edges, so the page disappears at once instead of within 10 min. It is safe while nginx runs; the next visit refills the
  copy.
- Origin: restore the two `.pre-edge-cache-*` files, `nginx -t`, reload. The
  deployer then reports drift against this release until the application is
  rolled back to the previous release as well (see
  [the deployer contract](production-deployer-contract.md)).
- Application: the normal release rollback, then the `find … -delete` on
  both edges (required). Without the marker no edge stores a new document,
  and stored entries stop being served within 10 min; the purge removes them
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
