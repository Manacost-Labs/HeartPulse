# Arena GeoDNS and image edge cache

## Purpose

`arena.hs-manacost.ru` uses self-hosted authoritative GeoDNS so Russian
visitors keep using the RF access proxies while other visitors use the OVH
edge in Limburg. Card images, full art, proxied public resources, and hashed
frontend assets are cached close to the visitor.

No third-party CDN is required. Cloudflare only delegates the child DNS zone;
it does not proxy HTTP traffic for this hostname.

## Routing

The parent zone delegates `arena.hs-manacost.ru` to:

- `geo-ru.hs-manacost.ru` — `194.67.92.242`;
- `geo-eu.hs-manacost.ru` — `162.19.220.14` and
  `2001:41d0:701:1100::709b`.

Both nameservers run the same PowerDNS GeoIP zone. RU client subnets receive
`194.67.92.242` and `186.246.28.244`; European/default client subnets receive
the OVH address. RU responses deliberately contain no AAAA record, preventing
IPv6 from bypassing the RF proxies.

The backend honors EDNS Client Subnet. A recursive resolver that sends neither
a usable ECS subnet nor a resolver address located near the user cannot be
geolocated reliably. Known Cloudflare, Quad9, AdGuard, and NextDNS ranges are
biased toward the RF pool to protect Russian accessibility. Google and other
ECS-capable resolvers are routed from the client subnet they provide.

## Local mirrors and cache

The origin synchronizes immutable data to both the Limburg and Moscow nodes:

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
