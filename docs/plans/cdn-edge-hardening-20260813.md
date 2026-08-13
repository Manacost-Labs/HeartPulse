<!-- markdownlint-disable MD013 -->

# CDN and regional edge hardening — 13 August 2026

## Objective

Remove the measured causes of slow and unreliable card/page delivery without reducing card-image quality or allowing private application responses into a shared cache. Limburg is a mandatory release target alongside Moscow and Novosibirsk.

## Baseline

- Production application release: `de085f59229ef0b1eee0611261a61b3b9d4f366d`.
- Limburg reached 100% disk usage with only 347,250,688 bytes available.
- Its Nginx cache occupied about 30 GB and allowed `max_size=28g inactive=30d` on a 40 GB filesystem.
- Each edge retained 62 frontend release trees; Limburg used about 7.5 GB for them.
- The CDN host returned the 67,734-byte entry JavaScript without compression on Limburg; the application host returned 20,595-byte gzip.
- Timeweb gzip, HTTP/3 and a 30-day edge TTL were enabled and image optimization was disabled, but a provider-wide seven-day browser TTL overrode HTML, runtime and API headers.

## Constraints

- Preserve full card dimensions, WebP bytes and original download routes.
- Keep HTML, runtime configuration, authentication, subscriptions, profiles, administration and personalized API responses outside shared caches.
- Accept only `GET` and `HEAD` on the public CDN allowlist and strip credentials before fallback.
- Keep each infrastructure change reversible with an on-host backup and `nginx -t` before reload.
- Treat Limburg IPv4 and IPv6 as required probes.

## Implementation slices

1. Relieve the Limburg capacity incident by lowering cache lifetime/capacity and evicting only recoverable objects.
2. Version one cache policy for all edges: 18 GB maximum, seven-day inactivity and an 8 GB filesystem reserve.
3. Enable gzip explicitly in the CDN public-static context so behavior does not depend on region-specific Brotli modules.
4. Retain the active frontend release plus two successfully activated immutable rollback releases; incomplete preparations, unknown directories and symlinks never displace them.
5. Monitor disk reserve, release SHA, local mirrors, CDN compression, private-path 404, Limburg IPv6 and Timeweb card fallback.
6. Disable only Timeweb's browser-cache override; do not combine this with image optimization, edge TTL or origin changes.
7. Roll out Moscow, Novosibirsk and Limburg one at a time, then run browser, integrity and latency checks.

## Acceptance criteria

- Every edge has at least 8 GiB available and Nginx remains active after two monitor cycles.
- A gzip-only CDN JavaScript request returns `Content-Encoding: gzip` in all three regions.
- The CDN hostname returns 404 for a private subscription path.
- Known cards return `X-Proxy-Cache: LOCAL`; direct Timeweb card delivery returns 200 `image/webp`.
- Decompressed CDN JavaScript hashes equal the active production asset.
- Card files remain byte-identical across mirrors and Timeweb image optimization remains disabled.
- Timeweb no longer replaces origin cache policy with `max-age=604800` on HTML, runtime configuration or APIs.
- The active frontend SHA and exactly two inactive rollback releases remain after cleanup.

## Rollback

- Restore timestamped Nginx/activator backups, remove the new cache-path file, run `nginx -t`, then reload.
- Re-publish a pruned immutable release through `arena-static-sync.service` if an older rollback requires it.
- Restore Timeweb `config.cache.browser` from the root-only pre-change API snapshot.
- If a region fails verification, stop that region's rollout; never widen the CDN allowlist as a workaround.
