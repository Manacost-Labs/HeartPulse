<!-- markdownlint-disable MD013 -->

# Global public asset delivery

## Objective

Serve every required public image, media file, font, and hashed frontend asset through a regional edge or CDN cache while keeping private and mutable application responses outside shared caches.

## Delivery classes

| Class | Example paths | Shared cache policy |
| --- | --- | --- |
| Hashed frontend | `/assets/*.js`, `/assets/*.css`, bundled fonts and icons | one year, `immutable` |
| Versioned cards | `/api/card-image/**` | 30 days, `immutable` when the version is explicit |
| Public upstream media | `/api/public-resource/**` | response-driven, bounded, stale on upstream failure |
| Mutable public metadata | manifest, non-hashed icons | short TTL with revalidation |
| Search metadata | `robots.txt`, sitemap documents | origin or short edge cache; never immutable |
| Runtime switches | `/runtime-config.js` | `no-store`, always origin-backed |
| Private application | auth, subscriptions, profiles, admin, personalized API | `private, no-store`; never CDN cached |

## Contract

- Only an allowlisted public path can change delivery origin.
- CDN paths accept only `GET` and `HEAD` and never receive cookies or authorization headers.
- Path and version query parameters are preserved; unknown query parameters must not create an unbounded cache key space.
- Hashed assets and versioned media are content-stable for the lifetime of their URL.
- Full-quality originals remain available. Provider image optimization must not silently crop or degrade card art.
- Every resource class retains a same-origin copy or an automated routing fallback.
- `Timing-Allow-Origin`, CORS, and exposed diagnostic headers are enabled only where browser modules, fonts, or measurement require them.

## Rollout order

1. Inventory and classify existing browser resource URLs.
2. Public images and media.
3. Fonts and icons.
4. CSS.
5. JavaScript and module-preload dependencies.
6. Region-by-region activation after browser and performance verification.

Each class uses a separate feature or routing switch. A failure rolls back only that class.

## Initial service-level objectives

- Static cache-hit ratio: at least 95% per region after warm-up.
- Cached static TTFB p95: at most 250 ms in a region with a local edge.
- Static availability: at least 99.9% measured by independent probes.
- No credential-bearing request and no private response observed on the CDN hostname.
- Core Web Vitals p75: LCP at most 2.5 s, INP at most 200 ms, CLS at most 0.1.

These budgets are ratchets. The measured baseline may justify stricter targets, but a target is not weakened to hide a regression.

## Verification

- Unit tests prove allowlist, origin, query, and fallback behavior.
- Nginx contract tests prove method, path, cache-control, CORS, and no-store boundaries.
- Release tests prove that every referenced hashed asset exists in the same immutable release.
- Browser tests cover first load, navigation, lightbox, font loading, offline upstream fallback, and mobile layout.
- Regional probes record DNS, TLS, TTFB, download duration, status, cache state, serving edge, and release.

## Public CDN hostname canary

The first expanded allowlist exposes `/assets/`, `/fonts/`, release-owned
visual directories, and a closed list of root icons on
`cdn.arena.hs-manacost.ru`. It does not yet rewrite browser URLs. The CDN edge
serves synchronized local files first, strips cookies and authorization on an
origin miss, ignores arbitrary query strings in its cache key, and keeps
`/runtime-config.js` plus every `/api` path behind the default `404` boundary.

## Documentation impact for every implementation slice

The source change and its tests update this specification plus the owning runbook or operations document in the same commit. Non-obvious trust, cache, and rollback invariants receive concise inline comments. Shipped behavior is added to `CHANGELOG.md`.
