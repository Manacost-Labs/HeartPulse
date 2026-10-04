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

An unexpected, duplicated, or missing value becomes `unknown`. The cardinality
of these header dimensions is fixed; arbitrary header contents never become
metric attributes.

## Page dimensions

The browser also reports, per batch and per LCP value, dimensions derived by
`shared/webVitalsDimensions.ts`:

- `route`: the Next.js page template of the loaded URL, such as
  `/standard/cards/[format]/[cardId]/`, or `other` when no template matches.
  A missing entity under a known template, such as `/heroes/999999/`, still
  counts under `/heroes/[dbfId]/`;
- `device`: `mobile` below 1024 px, where the public shell switches to its
  desktop sidebar, otherwise `desktop`;
- `lcp_target` (LCP only): the element's tag from a fixed list plus at most
  one lower-case component class of up to 48 characters, `none` without an
  element.

Unlike the proxy headers, these come from the request body, which any client
can forge. A missing value becomes `unknown` so tabs opened before a release
keep reporting; a present value that fails validation rejects the whole report
with `400`. `route` and `device` must match their fixed lists, so their
cardinality is fixed and a raw path, id or query string is rejected.
`lcp_target` is validated by shape only: an allowlisted tag plus one class
name of lower-case letters, digits and BEM separators, at most 48 characters,
without a run of three digits and not a Tailwind utility. The browser fills it
from the element's own tag and class names and never reads element text, URLs
or attributes, but a forged report can still store any word of that shape
(`p.leeroy-jenkins`). Its values are bounded in length and form, not
enumerated; the endpoint shares the general `/api/` limit of 120 requests per
minute per client. How to read the dimensions is described in
`docs/runbooks/web-vitals-field-data.md`.

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

The Sentry metric privacy filter explicitly allowlists `edge_region`,
`client_region`, `route`, `device`, and `lcp_target`. Tests must fail if a
bounded dimension is accidentally removed before ingestion, while arbitrary
URL, user, and query attributes remain forbidden.

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

- Unit tests reject arbitrary and duplicated labels, raw paths, unknown
  devices and LCP descriptors that are not a known tag plus one well-formed
  class, and keep the route allowlist equal to the Next.js page directory.
- Route tests verify bounded response diagnostics and capture context.
- Nginx contract tests must prove that edges overwrite browser headers and the
  origin trusts only known sockets before the first non-`unknown` rollout.
- Production dashboards must always display sample counts beside percentiles.
