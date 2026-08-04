<!-- markdownlint-disable MD013 -->

# Global edge rollout

## Purpose

This runbook expands Arena delivery without mixing public cacheable files with
authentication, subscriptions, profiles, administration, or private API data.
It is the operational companion to ADR-009 and the global static-asset
specification.

## Current production state

As of 4 August 2026:

- GeoDNS sends Russian users to the Moscow or Novosibirsk edge and other users
  to the Limburg edge;
- all three edges derive a coarse `client_region` from the immediate visitor
  socket and overwrite browser-provided region headers;
- the origin accepts region labels only from trusted edge sockets or the
  controlled RF tunnels;
- Web Vitals store `edge_region` and `client_region` after privacy filtering;
- card images use `cdn.arena.hs-manacost.ru`, with regional cache, Timeweb
  upstream cache, and same-origin fallback;
- the application runtime switch can disable card-image CDN URLs without a
  rebuild.

This is the measurement foundation, not the completion of the global static
migration. America and Asia currently have no self-hosted Arena edge.

## Release gates

Every delivery class advances independently through these gates:

1. **Inventory:** list every eligible path and prove it contains no private or
   user-specific response.
2. **Contract:** allow only `GET` and `HEAD`, strip `Cookie` and
   `Authorization`, bound cache keys, and define CORS only where required.
3. **Canary:** activate one resource class and one region while same-origin
   delivery remains available.
4. **Measure:** compare availability, cached TTFB, LCP, INP, and error rate to
   the pre-change baseline for at least one full traffic cycle.
5. **Expand:** enable the remaining regions only when the budgets hold.
6. **Document:** update the specification, operational topology, rollback, and
   changelog in the same change set.

## Planned resource order

1. public images and media;
2. fonts and icons;
3. hashed CSS;
4. hashed JavaScript and module-preload dependencies;
5. short-lived mutable public files.

`/runtime-config.js`, HTML, authentication, subscription, profile,
administration, and personalized API responses never enter the shared cache.

## Regional measurement

Use the Sentry distributions `web.vital.ttfb`, `web.vital.lcp`,
`web.vital.inp`, and `web.vital.cls`. Group each report by both
`client_region` and `edge_region`, and include p50, p75, p95, sample count, and
the `unknown` share. Compare at least:

- `russia` through Moscow and Novosibirsk;
- `europe` through Limburg;
- `north-america` through the current default edge;
- `asia` through the current default edge.

Synthetic probes must record DNS duration, connect duration, TLS duration,
TTFB, total download time, response status, cache state, edge label, and
release SHA. A real probe for America or Asia requires an Arena-controlled
host in that region; a label generated from Europe is not a substitute.

## Static-plane checks

For every canary asset:

```bash
curl -sS -o /dev/null -D - https://cdn.arena.hs-manacost.ru/api/card-image/EX1_001/thumb.webp
curl -sS -o /dev/null -w 'status=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n' \
  https://cdn.arena.hs-manacost.ru/api/card-image/EX1_001/thumb.webp
```

Two successive requests must return `200`; the warm request must come from a
regional or upstream cache. Requests using `POST`, cookies, authorization, an
unknown path, or a private API path must never return cached application data.

## Dynamic-plane checks

Authentication and API responses must retain `private, no-store` or
`no-store`, and edge configurations must bypass shared caches. Regional
proxies may reuse upstream connections and compress responses, but they must
not retry non-idempotent writes automatically.

Verify at minimum:

```bash
curl -sS -D - -o /dev/null https://arena.hs-manacost.ru/api/health/ready
curl -sS -D - -o /dev/null https://arena.hs-manacost.ru/runtime-config.js
curl -sS -D - -o /dev/null 'https://arena.hs-manacost.ru/?login'
```

## Rollback

Rollback is scoped to the affected plane:

- client URL migration: disable its root-managed runtime switch;
- edge path migration: remove only the new allowlisted location and reload
  Nginx after `nginx -t`;
- bad release: use the immutable application release rollback;
- regional failure: remove the unhealthy edge from GeoDNS while retaining the
  other regions;
- telemetry regression: preserve delivery, revert only the new metric field,
  and never widen the privacy allowlist as a workaround.

Keep the pre-change Nginx files under `/var/backups/` until the complete
observation window has passed.

## Handoff context

Before continuing this rollout, read:

- `docs/decisions/009-global-edge-delivery-and-private-api-boundary.md`;
- `docs/specs/global-static-asset-delivery.md`;
- `docs/specs/regional-performance-telemetry.md`;
- `docs/operations/arena-geodns-edge-cache.md`;
- this runbook.

Do not infer that all static files use the CDN hostname merely because they
are cached by the regional `arena.hs-manacost.ru` edge. Record separately the
browser URL plane, the regional edge cache, and the Timeweb upstream cache.
