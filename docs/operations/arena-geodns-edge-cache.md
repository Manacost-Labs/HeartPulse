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

The parent zone delegates `arena.hs-manacost.ru` to:

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
nodes:

- `/srv/arena/card-images/current` — normalized card images;
- `/srv/arena/static/current` — the current frontend release;
- `/var/cache/nginx/hs-arena` — full art and same-origin public resources.

Publication is atomic. A new version is copied into `versions/`, validated by
minimum file-count and byte-size checks, and then exposed by changing the
`current` symlink. If a local file is unavailable, Nginx falls back to the
origin cache instead of returning an error.

Mutable search metadata (`robots.txt`, `sitemap.xml`, and `/sitemaps/`) is never
marked immutable. Hashed frontend assets and versioned card images use long
browser cache lifetimes.

## Automatic jobs

The origin runs these systemd timers:

- `arena-card-image-sync.timer` — card images every 15 minutes;
- `arena-static-sync.timer` — frontend assets every 3 minutes;
- `arena-public-resource-warm.timer` — Limburg full-art/public-resource warm;
- `arena-public-resource-warm-ru.timer` — Moscow full-art/public-resource warm;
- `arena-public-resource-warm-ru-novosibirsk.timer` — Novosibirsk
  full-art/public-resource warm;
- `arena-geodns-monitor.timer` — DNS and edge checks every 5 minutes.

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
