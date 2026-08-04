<!-- markdownlint-disable MD013 -->

# ADR-009: Global edge delivery and private API boundary

## Status

Proposed for incremental rollout.

## Date

4 August 2026.

## Context

Arena already has GeoDNS, European and Russian edge nodes, local static mirrors, Timeweb-backed card-image delivery, and edge-tagged Web Vitals. The next objective is to deliver all public static content quickly in Russia and worldwide without exposing authentication, subscription, profile, or other personalized responses to a shared cache.

The current default route sends non-Russian traffic through the European edge. That protects availability but cannot provide minimum latency to users in the Americas and Asia. Regional proxies can reduce DNS, TLS, and connection setup time for dynamic requests, but they cannot remove the origin and database round trip.

## Decision

Use two explicit delivery planes:

1. A public static plane for versioned images, media, fonts, and hashed frontend assets. It may use regional mirrors and Timeweb CDN, accepts only `GET` and `HEAD`, never forwards browser credentials, and retains an origin fallback.
2. A private dynamic plane for HTML, authentication, subscription, profiles, administration, and non-public API responses. It uses trusted regional reverse proxies, persistent origin connections, compression, and health-based routing, but shared caching is forbidden.

Expand global routing only after region-tagged real-user and synthetic measurements establish a baseline. Add North American and Asian edge nodes when their p75 TTFB cannot meet the agreed budget through the existing network.

Every delivery class must have an independent runtime or routing rollback. A rollout proceeds by resource class and region instead of switching the whole site at once.

## Trust and privacy boundary

- Client and edge region labels use closed allowlists.
- The first trusted edge overwrites client-supplied region headers.
- Telemetry stores coarse regions and route groups, not IP addresses, account identifiers, cookies, query strings, or full page URLs.
- Authorization and session-bearing responses use `private, no-store` and never enter Timeweb or a shared Nginx cache.
- Public asset CORS is credential-free and limited to the resource types that require it.

## Alternatives considered

### Put the entire site behind one CDN cache

Rejected because HTML and API responses can contain authentication or subscription state. A cache-key mistake would have high privacy impact.

### Keep only the European and Russian nodes

Rejected as the final architecture because users in the Americas and Asia would retain an avoidable intercontinental edge hop.

### Deploy active application and database replicas immediately

Deferred. This would improve dynamic latency most, but introduces distributed session, write consistency, failover, and migration complexity. First measure the remaining proxy-to-origin cost.

## Consequences

- Static and dynamic delivery can be tuned and rolled back independently.
- Global performance becomes measurable by client region and serving edge.
- Additional regional VPS capacity may be required after the baseline period.
- Static URL policy, Nginx configuration, telemetry dimensions, monitoring, and documentation must evolve together.

## Required follow-up documentation

- `docs/specs/global-static-asset-delivery.md` for cache and URL contracts;
- `docs/specs/regional-performance-telemetry.md` for metrics and privacy;
- `docs/runbooks/global-edge-rollout.md` for activation and rollback;
- `docs/operations/arena-geodns-edge-cache.md` for the deployed topology.
