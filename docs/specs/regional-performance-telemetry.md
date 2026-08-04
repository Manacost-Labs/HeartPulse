# Regional performance telemetry

## Objective

Compare real and synthetic performance in Russia, Europe, the Americas, Asia,
Oceania, and Africa without collecting visitor identity or raw network
addresses.

## Dimensions

The application accepts only these bounded dimensions from its trusted proxy
boundary:

- `edge_region`: the edge that served the request;
- `client_region`: `russia`, `europe`, `north-america`, `south-america`,
  `asia`, `oceania`, `africa`, or `unknown`;
- `navigation_type` and the Web Vitals rating defined by the browser library.

An unexpected, duplicated, or missing value becomes `unknown`. Cardinality is
fixed; arbitrary header contents never become metric attributes.

## Trust boundary

The browser cannot select a trusted geography. The first Arena edge must
derive a coarse client region from its local geolocation database and
overwrite `X-Arena-Client-Region`. The origin accepts that header only through
a known edge socket or the existing RF tunnel, normalizes it against the
allowlist, and sends only the normalized label to metrics storage.

Until the edge contract is deployed, production reports `unknown`; the server
does not infer geography from forwarding headers. Raw IP addresses,
`X-Forwarded-For`, account IDs, cookies, query strings, and full URLs are not
stored with Web Vitals.

The Sentry metric privacy filter explicitly allowlists both `edge_region` and
`client_region`. Tests must fail if either bounded dimension is accidentally
removed before ingestion, while arbitrary URL, user, and query attributes
remain forbidden.

## Metrics

The existing endpoint continues to accept CLS, FCP, INP, LCP, and TTFB. Reports
are compared by p50, p75, and p95 plus sample count. A future resource-timing
slice may add bounded asset classes and cache outcomes without recording an
individual asset URL.

## Initial budgets

- LCP p75: at most 2.5 seconds;
- INP p75: at most 200 milliseconds;
- CLS p75: at most 0.1;
- cached static TTFB p95: at most 250 milliseconds where a regional edge
  exists;
- `unknown` client-region share: below 5% after all edge maps are deployed.

## Verification

- Unit tests reject arbitrary and duplicated labels.
- Route tests verify bounded response diagnostics and capture context.
- Nginx contract tests must prove that edges overwrite browser headers and the
  origin trusts only known sockets before the first non-`unknown` rollout.
- Production dashboards must always display sample counts beside percentiles.
