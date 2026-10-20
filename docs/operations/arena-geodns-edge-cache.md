# Arena GeoDNS and image edge cache

## Purpose

`arena.hs-manacost.ru` uses self-hosted authoritative GeoDNS so Russian
visitors keep using the RF access proxies while other visitors use the OVH
edge in Limburg. Card images, full art, proxied public resources, and hashed
frontend assets are cached close to the visitor. Card-image misses use Timeweb
CDN as an additional upstream cache and fall back to the Arena origin on
upstream errors.

Cloudflare only delegates the child DNS zone; it does not proxy HTTP traffic
for this hostname. Timeweb is not in the HTML, authentication, or dynamic API
path.

## Routing

Since 2026-10-20 the public hosts `hearthpulse.net`, `cdn.hearthpulse.net`,
`kolodahearthstone.com` and `hs-manacost.ru` use Cloudflare Load Balancing
geo steering in DNS-only mode (TTL 60, location from ECS, else the resolver
address). Russia and the CIS (RU, BY, KZ, KG, UZ, TJ, AM, AZ, GE, MD, MN)
receive only the RF pool (`194.67.92.242`, `186.246.28.244`); every other
region prefers the EU pool, the OVH London edge `57.129.183.118`. The RF
pool is also the fallback pool. Rollback: delete the load balancer; the
original A records of the same name resume. The London edge reaches the
origin directly over HTTPS (no SSH tunnels) and reuses the
`eu-germany-limburg` Web Vitals label until a dedicated label ships.

The legacy delegation of `arena.hs-manacost.ru` described below is retired.
The parent zone delegated `arena.hs-manacost.ru` to:

- `geo-ru.hs-manacost.ru` — `194.67.92.242`;
- `geo-eu.hs-manacost.ru` — `162.19.220.14` and
  `2001:41d0:701:1100::709b`.

Both nameservers run the same PowerDNS GeoIP zone. RU client subnets receive
`194.67.92.242` and `186.246.28.244`; European/default client subnets receive
the OVH address. RU responses deliberately contain no AAAA record, preventing
IPv6 from bypassing the RF proxies.

The two RF nodes intentionally remain active-active. Both have the same local
card and frontend mirrors, both retain a warmed full-art cache, and monitoring
tests each node independently. This keeps the site reachable if one RF route
or host degrades; a primary/standby policy should only replace it after
region-tagged browser measurements show a sustained user-visible benefit.

The backend honors EDNS Client Subnet. A recursive resolver that sends neither
a usable ECS subnet nor a resolver address located near the user cannot be
geolocated reliably. Known Cloudflare, Quad9, AdGuard, and NextDNS ranges are
biased toward the RF pool to protect Russian accessibility. Google and other
ECS-capable resolvers are routed from the client subnet they provide.

## Local mirrors and cache

The origin synchronizes immutable data to the Limburg, Moscow, and Novosibirsk
nodes. Both `arena.hs-manacost.ru` and `cdn.arena.hs-manacost.ru` read these
local mirrors before using a remote upstream:

- `/srv/arena/card-images/current` — normalized card images;
- `/srv/arena/static/current` — the current frontend release;
- `/var/cache/nginx/hs-arena` — full art and same-origin public resources.

Publication is atomic. A new version is copied into `versions/`, validated by
minimum file-count and byte-size checks, normalized into a new generation, and
then exposed by changing the `current` symlink. The sync skip path also checks
raw/served counts and manifest freshness, so cards added inside an existing
cache version cannot remain outside the active mirror. If a local file is
unavailable, the CDN host falls back to Timeweb and then to the origin.

Frontend synchronization is delta-based. The origin first compares the edge's
active release SHA and skips the tree scan when it is already current. For a
new release, rsync uses the active immutable tree as `--link-dest`: unchanged
files become hard links, while only changed files cross the network into the
inactive version. Activation still occurs only after the complete file-count,
byte-size, entry-document, and Nginx checks pass.

The shared regional cache is bounded by the versioned
`arena-edge-cache-path.conf`: `max_size=18g`, `inactive=7d`, and `min_free=8g`.
The absolute reserve is required because Limburg has the smallest root volume.
The same file declares the separate 1 GB `hearthpulse_documents` zone for
anonymous HearthPulse documents
([edge caching](../runbooks/hearthpulse-edge-caching.md)).
Frontend activation retains the active release and two additional successfully
activated rollback trees. An incomplete prepared tree without its matching
manifest never displaces a known-good rollback. Unknown directories and
release-shaped symlinks are never cleanup targets; a removed immutable release
can be republished from the origin.

Mutable search metadata (`robots.txt`, `sitemap.xml`, and `/sitemaps/`) is never
marked immutable. Hashed frontend assets and versioned card images use long
browser cache lifetimes.

## Automatic jobs

The origin runs these systemd timers:

- `arena-card-image-sync.timer` — card images every 15 minutes;
- `arena-static-sync.timer` — frontend assets every 3 minutes;
- `arena-public-resource-warm.timer` — Limburg media and asset warm;
- `arena-public-resource-warm-ru.timer` — Moscow media and asset warm;
- `arena-public-resource-warm-ru-novosibirsk.timer` — Novosibirsk media and
  asset warm;
- `arena-geodns-monitor.timer` — DNS and edge checks every 5 minutes.

The versioned units and scripts are:

- `deploy/arena-static-sync.sh` → `/usr/local/sbin/sync-arena-static`;
- `deploy/activate-arena-static.sh` →
  `/usr/local/sbin/activate-arena-static` on every edge;
- `deploy/monitor-arena-geodns.sh` →
  `/usr/local/sbin/monitor-arena-geodns` on the origin;
- `deploy/nginx/arena-edge-cache-path.conf` →
  `/etc/nginx/conf.d/34-arena-edge-cache-path.conf` on every edge;
- `deploy/systemd/arena-static-sync.{service,timer}` → `/etc/systemd/system/`;
- `deploy/edge-static-sync.conf.example` documents the root-only topology file
  `/etc/hs-arena/edge-static-sync.conf`;
- `deploy/arena-card-image-sync.sh` → `/usr/local/sbin/sync-arena-card-images`;
- `deploy/warm-arena-public-resources.sh` →
  `/usr/local/sbin/warm-arena-public-resources`;
- `deploy/systemd/arena-card-image-sync.{service,timer}` and
  `deploy/systemd/arena-public-resource-warm{,-ru,-ru-novosibirsk,-eu-london}.*`
  → `/etc/systemd/system/`.

After changing these files, run `npm run test:deployment`, install the scripts
with mode `0755`, reload systemd, start the service once, and confirm that its
second run reports every edge as already current without invoking rsync.

### Card-image sync and media warm

The card-image sync reads the same `/etc/hs-arena/edge-static-sync.conf` as the
frontend sync (`ARENA_STATIC_EDGE_SPECS`, or a dedicated
`ARENA_CARD_IMAGE_EDGE_SPECS` when card images need a different set). Removing
an edge from that file removes it from both syncs; the service no longer fails
every 15 minutes on a withdrawn node.

An edge that is still being brought up belongs in the root-only
`/etc/hs-arena/card-image-optional-edges.conf`
(`deploy/card-image-optional-edges.conf.example`). It is synchronized on every
run, but a failure only logs `Best-effort card image edge failed` and is
recorded in `/var/lib/arena-edge/card-sync/<edge>.status`; the exit status
counts required edges only. The new London EU edge (`57.129.183.118`) starts
there and has its own `arena-public-resource-warm-eu-london` unit, so its
failures never block a deploy or another edge. It needs
`deploy/activate-arena-card-images.sh` installed as
`/usr/local/sbin/activate-arena-card-images` before its first sync.

Each warm unit pins one edge with `curl --resolve` for `hearthpulse.net` and
`cdn.hearthpulse.net`. The retired `arena.hs-manacost.ru` only answers `301`,
so a warm through it caches nothing; redirects now count as failures. A run
warms what pages load:

- the hashed `/_next/static` files named by the current build's manifests;
- public images that the edge vhost caches (`wallpaper/`, `class_icon/`,
  `bg-legacy/`, logos, favicons and the other listed directories);
- every card image as `cdn.hearthpulse.net/api/card-image/<id>/{thumb,full}.webp`
  with the server's `CARD_IMAGE_CACHE_VERSION`;
- article covers, banners, hero skins and catalog card URLs found on the pages
  of `/sitemaps/static.xml`;
- proxied full art and battleground images from release bundles and server
  data.

`/api/public-resource/` and `/api/article-cover` share the visitor
public-media rate limit, so they run at concurrency 4 with a 0.45 s pause.
Everything else runs at concurrency 8 with a 5 s connect and 20 s request
limit. A failed probe of the edge stops the run within seconds, and a 40-minute
deadline keeps it inside the unit's 45-minute timeout. A region named in
`HEARTHPULSE_MONITOR_QUARANTINED_REGIONS` of
`/etc/hs-arena/hearthpulse-shadow-monitor.env` is skipped with exit 0; removing
it from the quarantine resumes warming without editing units.

Each run writes `/var/lib/arena-edge/public-warm/<edge>/latest/summary` with
the `X-Proxy-Cache` counts. A second run reports mostly `HIT` for the cached
families. `BYPASS` for `/api/public-resource/`, `/api/article-cover` and
`/uploads/` on `hearthpulse.net` means the edge still runs a vhost from before
[edge caching](../runbooks/hearthpulse-edge-caching.md), which keeps these
families; the warm then fills only origin-side caches. `BYPASS` for
`/_next/static/` or for CDN card images means the edge runs an outdated vhost.
Inspect a run with
`ARENA_WARM_DRY_RUN=1 warm-arena-public-resources <edge-ip>`, which builds
the URL lists without requesting them.

Limburg (`162.19.220.14`) has been unreachable on ICMP, SSH and HTTPS from the
origin and from Moscow since about 2026-10-05; it stays quarantined and out of
the topology file until the node itself is restored.

The guarded activator defaults to a fail-closed floor of 300 files and 10 MB.
The static root that `npm run build:static` assembles has about 385 files and
15 MB (measured on 2026-09-30), and `tests/build-static-root.test.mjs` fails
when it comes within 20% of either floor. This heuristic rejects an undersized
tree below either floor; successful `rsync` is the integrity gate for a
transfer that remains above both floors. Remeasure the static root before
changing either threshold.

Until 2026-09-30 the floor was 4,500 files and 70 MB, sized for releases with
hashed Vite bundles. Releases built after the Vite retirement keep those
bundles only through the deployer's 35-day carry-forward, so an edge that
still runs the old activator refuses every new static release once they
expire: from the first deploy on or after about 2026-10-31. A refused
activation makes `arena-static-sync.service` exit non-zero, and the deploy
gate (`hs-arena-ci-deploy`) starts that service last, so every deploy would
then be reported as failed after the origin has already switched. Install the
current activator on every edge before then. As root on the origin, after the
release that contains the new floor is live:

```bash
source /etc/hs-arena/edge-static-sync.conf
release=/var/www/koloda/data/www/hs-arena.ru/current
script=$release/deploy/activate-arena-static.sh
hosts=${ARENA_STATIC_KNOWN_HOSTS:-/home/debian/.ssh/known_hosts}
for spec in "${ARENA_STATIC_EDGE_SPECS[@]}"; do
  IFS='|' read -r edge identity <<< "$spec"
  remote="ssh -i $identity -o BatchMode=yes -o ConnectTimeout=10"
  remote="$remote -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$hosts"
  rsync -p --chmod=F0755 --chown=root:root --rsync-path='sudo rsync' \
    -e "$remote" "$script" "$edge:/usr/local/sbin/activate-arena-static"
  $remote "$edge" 'sha256sum /usr/local/sbin/activate-arena-static'
done
sha256sum "$script"
```

Every edge must print the checksum of the release copy. Then start
`arena-static-sync.service` once and confirm that every edge reports the
release as already current.

The cache-path file replaces, rather than supplements, the historical
`proxy_cache_path` declaration embedded in an edge vhost. Back up both files,
remove exactly the old declaration and install the versioned file in one
transaction. A temporary duplicate `hs_arena_cache` zone is invalid. Restore
the backup automatically if `nginx -t` fails.

The monitor fails when any edge has less than 8 GiB available, serves a
different static release, omits gzip on the CDN JavaScript response, exposes a
private API route on the CDN hostname, loses its local card mirror, or cannot
serve the card through Timeweb. It also requires Timeweb HTML, runtime config
and readiness responses to preserve the origin's `no-store` policy. Limburg is
checked through both
`162.19.220.14` and `2001:41d0:701:1100::709b`.

Each PowerDNS node runs `dbip-country-update.timer`, which downloads and
validates the current DB-IP Lite country database before replacing the active
copy.

Inspect health without changing state:

```bash
systemctl status arena-geodns-monitor.service
systemctl list-timers 'arena-*'
dig +short @8.8.8.8 arena.hs-manacost.ru A +subnet=95.24.0.0/24
dig +short @8.8.8.8 arena.hs-manacost.ru A +subnet=80.187.0.0/24
```

An image served from a local mirror has `X-Proxy-Cache: LOCAL`. A warmed
public-resource response has `X-Proxy-Cache: HIT`.

## Regional Web Vitals

The existing browser RUM endpoint records `CLS`, `FCP`, `INP`, `LCP`, and
`TTFB` as Sentry distribution metrics. The origin adds a bounded
`edge_region` attribute derived from the immediate proxy socket:

- `eu-germany-limburg`;
- `ru-moscow`;
- `ru-novosibirsk`;
- `origin` for local operational requests;
- `unknown` for a missing or invalid mapping.

The browser cannot choose this value. Every edge overwrites
`X-Arena-Edge-Region`; the origin accepts that label only from its local RF
SSH tunnel and otherwise derives the label from the immediate edge socket.
The application validates the result against the fixed allowlist before
capture. Visitor IPs, account identifiers, cookies, and page URLs are not
included in the metric attributes.

Compare `web.vital.ttfb`, `web.vital.lcp`, and `web.vital.inp` by
`edge_region`, using p50, p75, and p95 plus each region's sample count. Keep
the RF nodes active-active until at least seven complete days contain enough
samples for both RF regions. Consider primary/standby only when one RF region
has a sustained p75 or p95 regression of at least 20% without a compensating
availability benefit. A high `unknown` share is a routing-instrumentation
fault, not a user-performance result.

### Coarse client regions

The regional edges use `ngx_http_geoip2_module` and the managed
`/var/lib/GeoIP/dbip-country-lite.mmdb` database to derive one bounded client
region from the immediate browser socket. Russia is kept separate from Europe;
the remaining labels are `europe`, `north-america`, `south-america`, `asia`,
`oceania`, `africa`, and `unknown`.

Every edge overwrites `X-Arena-Client-Region`. The origin accepts it only from
a known edge socket or the controlled RF tunnel and normalizes it again before
metrics capture. `X-Forwarded-For` and browser-provided region headers are not
part of this decision. The DB-IP updater must publish a readable, validated
database atomically; a missing database must fail deployment before Nginx is
reloaded.

## Rollback

The pre-change parent records are stored in `/var/lib/arena-geodns/` on the
origin. To remove the child delegation and restore the two former RF A records:

```bash
sudo /usr/local/sbin/rollback-arena-geodns
```

The rollback script reads the existing root-only Cloudflare credential file;
credentials are never embedded in this repository or in the saved DNS state.

After rollback, verify the parent and public answer:

```bash
dig +short @ed.ns.cloudflare.com arena.hs-manacost.ru NS
dig +short @1.1.1.1 arena.hs-manacost.ru A
```
